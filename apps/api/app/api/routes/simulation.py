"""API v1 : simulations 3D d'inondation (le rendu se fait côté globe)."""

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from app.api import auth_deps
from app.domain import hazard_model
from app.domain.models import User
from app.infrastructure.db.session import get_db_session
from app.services import simulation

router = APIRouter(prefix="/api/v1/simulations", tags=["simulation"])


class FloodIn(BaseModel):
    mode: Literal["level", "rain", "sensor"]
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lon: Optional[float] = Field(default=None, ge=-180, le=180)
    sensor_code: Optional[str] = Field(default=None, max_length=64)
    rise_m: Optional[float] = Field(default=None, ge=0, le=15, description="Montée de l'eau au-dessus du sol à la source (m).")
    rain_mm_h: Optional[float] = Field(default=None, ge=0, le=300)
    hours: Optional[float] = Field(default=None, gt=0, le=72)
    runoff: float = Field(default=0.6, ge=0, le=1)
    radius_m: float = Field(default=1500, ge=200, le=5000)
    cells: int = Field(default=120, ge=40, le=200)
    steps: int = Field(default=1, ge=1, le=8, description="Nombre d'images de la montée progressive.")
    dem_error_m: Optional[float] = Field(default=None, ge=0, le=10)

    @model_validator(mode="after")
    def _coherent(self):
        if self.mode == "level" and (self.rise_m is None or self.lat is None or self.lon is None):
            raise ValueError("Le mode « level » requiert lat, lon et rise_m.")
        if self.mode == "rain" and (self.rain_mm_h is None or self.hours is None or self.lat is None or self.lon is None):
            raise ValueError("Le mode « rain » requiert lat, lon, rain_mm_h et hours.")
        if self.mode == "sensor" and not self.sensor_code:
            raise ValueError("Le mode « sensor » requiert sensor_code.")
        return self


@router.post("/flood", status_code=201)
def run_flood(body: FloodIn, user: User = Depends(auth_deps.require_role("viewer")), db: Session = Depends(get_db_session)) -> dict:
    return simulation.run_flood(db, user.id, body.model_dump(exclude_none=True))


class HazardSimIn(BaseModel):
    """Paramètres du modèle indicatif multi-aléas.

    Les champs absents prennent une valeur par défaut documentée dans le
    catalogue (`GET /api/v1/hazards/catalog`). Aucune valeur n'est présentée
    comme une observation : la réponse est explicitement une simulation.
    """

    hazard: Literal[
        "earthquake", "tsunami", "volcano", "hurricane", "flood", "wildfire",
        "drought", "landslide", "sandstorm", "blizzard", "heatwave", "tornado", "storm",
    ]
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    name: Optional[str] = Field(default=None, max_length=160)
    magnitude: Optional[float] = Field(default=None, ge=0, le=10)
    depth_km: Optional[float] = Field(default=None, ge=0, le=800)
    ocean_depth_m: Optional[float] = Field(default=None, ge=100, le=9000)
    distance_coast_km: Optional[float] = Field(default=None, ge=1, le=10000)
    vei: Optional[float] = Field(default=None, ge=0, le=8)
    wind_kmh: Optional[float] = Field(default=None, ge=0, le=500)
    pressure_hpa: Optional[float] = Field(default=None, ge=800, le=1050)
    rain_mm_h: Optional[float] = Field(default=None, ge=0, le=400)
    rain_mm: Optional[float] = Field(default=None, ge=0, le=10000)
    normal_mm: Optional[float] = Field(default=None, gt=0, le=10000)
    duration_h: Optional[float] = Field(default=None, ge=0.01, le=1000)
    radius_km: Optional[float] = Field(default=None, ge=0.1, le=500)
    runoff: Optional[float] = Field(default=None, ge=0, le=1)
    slope_deg: Optional[float] = Field(default=None, ge=0, le=90)
    snow_mm_h: Optional[float] = Field(default=None, ge=0, le=300)
    temperature_c: Optional[float] = Field(default=None, ge=-90, le=60)
    humidity_pct: Optional[float] = Field(default=None, ge=0, le=100)
    soil_moisture: Optional[float] = Field(default=None, ge=0, le=1)
    height_m: Optional[float] = Field(default=None, ge=1, le=5000)


@router.post("/hazard")
def run_hazard_simulation(
    body: HazardSimIn,
    _: User = Depends(auth_deps.require_role("viewer")),
) -> dict:
    """Simulation indicative pour tous les aléas, sans écriture en base.

    Le calcul reste dans `app.domain.hazard_model` : l'interface ne fait
    qu'afficher le résultat et son avertissement. Aucune donnée de population
    ou d'infrastructure n'est inventée par ce modèle.
    """
    payload = body.model_dump(exclude_none=True)
    hazard = payload.pop("hazard")
    lat = payload.pop("lat")
    lon = payload.pop("lon")
    name = payload.pop("name", None)
    return hazard_model.simulate(hazard, payload, lat, lon, name)


@router.get("/automatic")
def automatic_floods(db: Session = Depends(get_db_session)) -> dict:
    """Impacts indicatifs publics calculés à partir des mesures récentes, sans écrire d'exécution manuelle."""
    return simulation.automatic_floods(db)


@router.get("")
def runs(limit: int = Query(20, ge=1, le=100), _: User = Depends(auth_deps.require_role("viewer")), db: Session = Depends(get_db_session)) -> list[dict]:
    return simulation.list_runs(db, limit)


@router.get("/{run_id}")
def one(run_id: int, _: User = Depends(auth_deps.require_role("viewer")), db: Session = Depends(get_db_session)) -> dict:
    return simulation.get_run(db, run_id)
