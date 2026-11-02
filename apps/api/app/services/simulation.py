"""Service de simulation d'inondation : MNT → modèle → résultat compact + traçabilité."""

import base64
import json
import math
import time
from pathlib import Path

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.exceptions import NotFoundError, RateLimitError, ValidationAppError
from app.domain import flood_model as fm
from app.domain.models import Reading, Sensor, SimulationRun
from app.infrastructure.dem import terrarium
from app.services import monitoring

DISCLAIMER = ("Simulation indicative sur modèle numérique de terrain : ni mesure ni prévision. "
              "Écoulement dynamique, ouvrages, drainage et infiltration non simulés.")
_RUNS: dict[int, list[float]] = {}


def ground_provider(south, west, north, east, rows, cols) -> np.ndarray:  # remplaçable dans les tests / par un MNT local
    return terrarium.ground_grid(south, west, north, east, rows, cols, Path(settings.dem_cache_dir))


def _limit(user_id: int | str | None) -> None:
    if user_id is None:
        return
    now = time.time()
    recent = [t for t in _RUNS.get(user_id, []) if now - t < 60]
    if len(recent) >= 10:
        raise RateLimitError("Trop de simulations : patientez une minute.", code="SIM_RATE_LIMIT")
    _RUNS[user_id] = recent + [now]


def _b64(a: np.ndarray, dtype) -> str:
    return base64.b64encode(a.astype(dtype).tobytes()).decode()


def run_flood(db: Session, user_id: int | None, p: dict) -> dict:
    _limit(user_id)
    mode, lat, lon = p["mode"], p.get("lat"), p.get("lon")
    rise = p.get("rise_m")
    sensor_info = None
    if mode == "sensor":
        sensor = monitoring.get_sensor(db, p["sensor_code"])
        point = monitoring.sensor_state(db, sensor)
        lat, lon = point["lat"], point["lon"]
        if rise is None:
            if sensor.bankfull_cm is None:
                raise ValidationAppError("Ce capteur n'a pas de niveau de débordement (bankfull_cm) : renseignez-le ou fournissez rise_m.", code="BANKFULL_MISSING")
            level = db.execute(select(Reading.water_level_cm).where(Reading.sensor_id == sensor.id).order_by(Reading.measured_at.desc()).limit(1)).scalar_one_or_none()
            if level is None:
                raise ValidationAppError("Aucune mesure disponible pour ce capteur.", code="NO_READING")
            rise = max(0.0, (level - sensor.bankfull_cm) / 100.0)
        sensor_info = {"code": sensor.code, "bankfull_cm": sensor.bankfull_cm}
        mode_model = "level"
    else:
        mode_model = mode
    if lat is None or lon is None:
        raise ValidationAppError("Position (lat, lon) requise.", code="POSITION_REQUIRED")
    radius = min(float(p.get("radius_m", 1500)), settings.sim_max_radius_m)
    n = int(p.get("cells", 120))
    dlat = radius / 111_320.0
    dlon = radius / (111_320.0 * max(0.2, math.cos(math.radians(lat))))
    south, north, west, east = lat - dlat, lat + dlat, lon - dlon, lon + dlon
    try:
        ground = ground_provider(south, west, north, east, n, n)
    except Exception as exc:  # réseau coupé et tuiles non en cache
        raise ValidationAppError(f"Altitudes indisponibles ({exc.__class__.__name__}) : vérifiez la connexion ou le cache MNT.", code="DEM_UNAVAILABLE")
    cell_m = 2 * radius / n
    err = float(p.get("dem_error_m", settings.dem_error_m))
    steps = int(p.get("steps", 1))

    def compute(frac: float) -> fm.FloodResult:
        if mode_model == "level":
            return fm.flood_from_level(ground, (n // 2, n // 2), float(rise if rise is not None else 0.0) * frac, cell_m, err)
        return fm.flood_from_rain(ground, float(p["rain_mm_h"]), float(p["hours"]) * frac, float(p.get("runoff", 0.6)), cell_m, err)

    frames = []
    for k in range(1, steps + 1):  # image par image : montée progressive (même modèle, niveau ou durée croissants)
        res = compute(k / steps)
        frames.append({"fraction": round(k / steps, 3), "depth_cm_b64": _b64(np.clip(res.depth_m * 100, 0, 65535), "<u2"),
                       "max_depth_m": round(res.max_depth_m, 2), "area_km2": round(res.area_km2, 3)})
    out = {
        "bbox": {"south": south, "west": west, "north": north, "east": east}, "rows": n, "cols": n, "cell_m": round(cell_m, 1),
        "depth_cm_b64": _b64(np.clip(res.depth_m * 100, 0, 65535), "<u2"), "possible_b64": _b64(res.possible, "u1"),
        "stats": {"max_depth_m": round(res.max_depth_m, 2), "area_km2": round(res.area_km2, 3), "volume_m3": round(res.volume_m3),
                  "surface_level_m": round(res.surface_level_m, 2), "possible_area_km2": round(float(res.possible.sum()) * cell_m**2 / 1e6, 3)},
        "assumptions": [f"MNT Terrarium (zoom 13), erreur verticale ±{err} m (provisoire)", f"grille {n}×{n}, cellule ≈ {cell_m:.0f} m",
                        "remplissage de cuvette avec connectivité à 8 voisins"] + ([f"ruissellement {p.get('runoff', 0.6)} (provisoire)"] if mode_model == "rain" else []),
        "frames": frames if steps > 1 else [], "disclaimer": DISCLAIMER, "sensor": sensor_info, "center": {"lat": lat, "lon": lon},
    }
    params = {k: v for k, v in p.items() if v is not None} | {"resolved_rise_m": rise}
    run = SimulationRun(user_id=user_id, mode=mode, params=json.dumps(params), result=json.dumps(out))
    db.add(run)
    db.commit()
    return {"id": run.id, **out}


def get_run(db: Session, run_id: int) -> dict:
    run = db.get(SimulationRun, run_id)
    if run is None:
        raise NotFoundError("Simulation introuvable.", code="SIM_NOT_FOUND")
    return {"id": run.id, "created_at": run.created_at, "params": json.loads(run.params), **json.loads(run.result)}


def list_runs(db: Session, limit: int = 20) -> list[dict]:
    rows = db.execute(select(SimulationRun).order_by(SimulationRun.id.desc()).limit(limit)).scalars()
    return [{"id": r.id, "mode": r.mode, "created_at": r.created_at, "params": json.loads(r.params)} for r in rows]
