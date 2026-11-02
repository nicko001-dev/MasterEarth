"""API v1 : simulations 3D d'inondation (le rendu se fait côté globe)."""

from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from app.api import auth_deps
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


@router.get("")
def runs(limit: int = Query(20, ge=1, le=100), _: User = Depends(auth_deps.require_role("viewer")), db: Session = Depends(get_db_session)) -> list[dict]:
    return simulation.list_runs(db, limit)


@router.get("/{run_id}")
def one(run_id: int, _: User = Depends(auth_deps.require_role("viewer")), db: Session = Depends(get_db_session)) -> dict:
    return simulation.get_run(db, run_id)
