"""Service de simulation d'inondation : MNT → modèle → résultat compact + traçabilité."""

import base64
import hashlib
import json
import math
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from geoalchemy2.shape import to_shape
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.exceptions import NotFoundError, RateLimitError, ValidationAppError
from app.domain import flood_model as fm
from app.domain.models import Reading, Sensor, SimulationRun, WeatherObservation
from app.infrastructure.dem import terrarium
from app.services import monitoring

DISCLAIMER = ("Simulation indicative sur modèle numérique de terrain : ni mesure ni prévision. "
              "Écoulement dynamique, ouvrages, drainage et infiltration non simulés.")
_RUNS: dict[int, list[float]] = {}
_AUTOMATIC_CACHE: dict[tuple[str, str], tuple[datetime, str, dict]] = {}
_AUTOMATIC_FAILURES: dict[tuple[str, str], tuple[datetime, datetime, str]] = {}


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


def run_flood(db: Session, user_id: int | None, p: dict, *, persist: bool = True, run_id: int | None = None) -> dict:
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
    if persist:
        run = SimulationRun(user_id=user_id, mode=mode, params=json.dumps(params), result=json.dumps(out))
        db.add(run)
        db.commit()
        return {"id": run.id, **out}
    return {"id": run_id if run_id is not None else -1, **out}


def _stable_automatic_id(key: str) -> int:
    value = int(hashlib.sha256(key.encode("utf-8")).hexdigest()[:8], 16)
    return -(value + 1)


def _automatic_result(
    db: Session,
    event_type: str,
    event_key: str,
    name: str,
    source: str,
    observed_at: datetime,
    input_data: dict,
) -> dict:
    cache_key = (event_type, event_key)
    failure = _AUTOMATIC_FAILURES.get(cache_key)
    if failure and failure[0] == observed_at and failure[1] > datetime.now(timezone.utc):
        raise ValidationAppError(failure[2], code="AUTO_DEM_UNAVAILABLE")
    input_signature = json.dumps(input_data, sort_keys=True)
    cached = _AUTOMATIC_CACHE.get(cache_key)
    if cached and cached[0] == observed_at and cached[1] == input_signature:
        simulation_result = cached[2]
    else:
        try:
            simulation_result = run_flood(
                db,
                None,
                input_data,
                persist=False,
                run_id=_stable_automatic_id(f"{event_type}:{event_key}"),
            )
        except ValidationAppError as exc:
            _AUTOMATIC_FAILURES[cache_key] = (
                observed_at,
                datetime.now(timezone.utc) + timedelta(minutes=5),
                exc.message,
            )
            raise
        _AUTOMATIC_CACHE[cache_key] = (observed_at, input_signature, simulation_result)
        _AUTOMATIC_FAILURES.pop(cache_key, None)
    return {
        "id": f"{event_type}:{event_key}",
        "type": event_type,
        "name": name,
        "source": source,
        "source_kind": (
            "weather_model" if source == "open-meteo"
            else "provider_report" if source == "openweather"
            else "iot_gauge" if source == "iot-rain-gauge"
            else "bulletin" if event_type == "rain_impact_estimate"
            else "iot_water_level"
        ),
        "observed_at": observed_at,
        "simulation": {"result": simulation_result, "input": input_data},
    }


def automatic_floods(db: Session, now: datetime | None = None) -> dict:
    """Derive public MNT estimates from recent rain or flood measurements."""
    now = now or datetime.now(timezone.utc)
    events, failures = [], []
    current_sensor_ids: set[str] = set()

    sensors = db.execute(
        select(Sensor).where(
            ~Sensor.code.like("DEMO-%"),
            Sensor.kind == "water_level",
            Sensor.status == "active",
            Sensor.bankfull_cm.is_not(None),
        )
    ).scalars()
    for sensor in sensors:
        reading = db.execute(
            select(Reading)
            .where(Reading.sensor_id == sensor.id)
            .order_by(Reading.measured_at.desc())
            .limit(1)
        ).scalar_one_or_none()
        if (
            reading is None
            or reading.measured_at < now - timedelta(minutes=settings.sensor_stale_minutes)
            or reading.measured_at > now + timedelta(minutes=5)
        ):
            continue
        if reading.water_level_cm <= sensor.bankfull_cm:
            continue
        event_key = f"sensor:{sensor.id}:{reading.id}"
        current_sensor_ids.add(event_key)
        try:
            result = _automatic_result(
                db,
                "water_level_estimate",
                event_key,
                sensor.name,
                "iot-water-level",
                reading.measured_at,
                {
                    "mode": "sensor",
                    "sensor_code": sensor.code,
                    "radius_m": 1500,
                    "cells": 80,
                    "steps": 1,
                },
            )
            result["sensor_code"] = sensor.code
            result["measured_water_level_cm"] = reading.water_level_cm
            events.append(result)
        except ValidationAppError as exc:
            failures.append({"name": sensor.name, "source": "iot-water-level", "error": exc.message})

    rain_rows = db.execute(
        select(WeatherObservation)
        .where(
            WeatherObservation.is_forecast.is_(False),
            WeatherObservation.valid_at >= now - timedelta(hours=24),
            WeatherObservation.valid_at <= now + timedelta(minutes=5),
        )
        .order_by(WeatherObservation.valid_at.desc())
        .limit(5000)
    ).scalars()
    hourly_by_source_point: dict[tuple[str, str], dict[datetime, WeatherObservation]] = {}
    for row in rain_rows:
        if (
            row.source == "open-meteo"
            and (row.name or "").startswith("Démo · Caniveau ")
        ):
            continue
        group_key = (row.source, row.point_key)
        hour = row.valid_at.replace(minute=0, second=0, microsecond=0)
        hourly = hourly_by_source_point.setdefault(group_key, {})
        hourly.setdefault(hour, row)
    current_rain_keys: set[str] = set()
    for (source, point), observations in hourly_by_source_point.items():
        latest = max(observations.values(), key=lambda observation: observation.valid_at)
        hourly_total = sum(observation.precip_mm for observation in observations.values())
        recent_peak = max(
            (
                observation
                for observation in observations.values()
                if observation.valid_at >= now - timedelta(hours=2)
            ),
            key=lambda observation: observation.precip_mm,
            default=None,
        )
        hourly_triggered = (
            recent_peak is not None
            and recent_peak.precip_mm >= settings.rain_orange_mm_h
        )
        if hourly_triggered and recent_peak is not None:
            trigger_observation = recent_peak
            model_intensity = recent_peak.precip_mm
            model_hours = 1
        elif hourly_total >= settings.rain_orange_24h_mm:
            trigger_observation = latest
            model_intensity = hourly_total / 24
            model_hours = 24
            hourly_triggered = False
        else:
            continue
        event_key = f"{source}:{point}"
        current_rain_keys.add(event_key)
        try:
            result = _automatic_result(
                db,
                "rain_impact_estimate",
                event_key,
                trigger_observation.name or point,
                source,
                trigger_observation.valid_at,
                {
                    "mode": "rain",
                    "lat": to_shape(trigger_observation.location).y,
                    "lon": to_shape(trigger_observation.location).x,
                    "rain_mm_h": model_intensity,
                    "hours": model_hours,
                    "radius_m": 1500,
                    "cells": 80,
                    "steps": 1,
                },
            )
            result["rain_24h_mm"] = round(hourly_total, 1)
            result["trigger_basis"] = "hourly" if hourly_triggered else "24h"
            result["threshold_mm_h"] = settings.rain_orange_mm_h if hourly_triggered else None
            result["threshold_24h_mm"] = (
                settings.rain_orange_24h_mm if not hourly_triggered else None
            )
            events.append(result)
        except ValidationAppError as exc:
            failures.append(
                {
                    "name": trigger_observation.name or point,
                    "source": source,
                    "error": exc.message,
                }
            )

    active_keys = {
        ("water_level_estimate", key) for key in current_sensor_ids
    } | {
        ("rain_impact_estimate", key) for key in current_rain_keys
    }
    for key in list(_AUTOMATIC_CACHE):
        if key not in active_keys:
            del _AUTOMATIC_CACHE[key]
    for key in list(_AUTOMATIC_FAILURES):
        if key not in active_keys:
            del _AUTOMATIC_FAILURES[key]
    return {
        "generated_at": now,
        "events": events,
        "failures": failures,
        "thresholds_provisional": True,
    }


def get_run(db: Session, run_id: int) -> dict:
    run = db.get(SimulationRun, run_id)
    if run is None:
        raise NotFoundError("Simulation introuvable.", code="SIM_NOT_FOUND")
    return {"id": run.id, "created_at": run.created_at, "params": json.loads(run.params), **json.loads(run.result)}


def list_runs(db: Session, limit: int = 20) -> list[dict]:
    rows = db.execute(select(SimulationRun).order_by(SimulationRun.id.desc()).limit(limit)).scalars()
    return [{"id": r.id, "mode": r.mode, "created_at": r.created_at, "params": json.loads(r.params)} for r in rows]
