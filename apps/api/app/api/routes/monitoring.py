"""API v1 : capteurs, mesures et alertes."""

from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api import auth_deps
from app.core.exceptions import ValidationAppError
from app.domain import iot_adapters
from app.domain.models import User
from app.infrastructure.db.session import get_db_session
from app.services import accounts, monitoring

router = APIRouter(prefix="/api/v1", tags=["monitoring"])
DistanceSample = Annotated[float, Field(gt=0, lt=1000, allow_inf_nan=False)]


class SensorIn(BaseModel):
    code: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    name: str = Field(min_length=1, max_length=255)
    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)
    mount_height_cm: float = Field(gt=0, le=1000)
    bankfull_cm: Optional[float] = Field(default=None, gt=0, le=1000, description="Niveau de débordement du canal (cm).")


class ReadingIn(BaseModel):
    samples_cm: list[DistanceSample] = Field(
        min_length=1,
        max_length=50,
        description="Rafale de distances mesurées (cm), strictement entre 0 et 1000.",
    )
    measured_at: Optional[datetime] = None


@router.get("/sensors")
def sensors(db: Session = Depends(get_db_session)) -> list[dict]:
    return monitoring.list_sensors(db)


@router.post("/sensors", status_code=201)
def create_sensor(body: SensorIn, actor: User = Depends(auth_deps.operator), db: Session = Depends(get_db_session)) -> dict:
    sensor = monitoring.create_sensor(db, **body.model_dump())
    accounts.audit(db, actor.email, "sensor_created", sensor.code, actor.id)
    return monitoring.sensor_state(db, sensor)


@router.post("/sensors/{code}/readings", status_code=201)
def ingest(code: str, body: ReadingIn, _who: str = Depends(auth_deps.device_or_operator), db: Session = Depends(get_db_session)) -> dict:
    reading, alert = monitoring.ingest(db, code, body.samples_cm, body.measured_at)
    return {"water_level_cm": reading.water_level_cm, "rise_cm_min": reading.rise_cm_min,
            "level": reading.level, "alert_triggered": alert.level if alert else None}


@router.get("/sensors/{code}/readings")
def readings(code: str, limit: int = Query(100, ge=1, le=1000), db: Session = Depends(get_db_session)) -> list[dict]:
    return [{"measured_at": r.measured_at, "water_level_cm": r.water_level_cm, "rise_cm_min": r.rise_cm_min,
             "level": r.level} for r in monitoring.list_readings(db, code, limit)]


@router.get("/alerts")
def alerts(limit: int = Query(50, ge=1, le=500), db: Session = Depends(get_db_session)) -> list[dict]:
    return monitoring.list_alerts(db, limit)


@router.post("/ingest/{adapter}", status_code=201)
def ingest_platform(adapter: str, body: dict, _who: str = Depends(auth_deps.device_or_operator), db: Session = Depends(get_db_session)) -> dict:
    """Réception de webhooks de plateformes IoT (generic, ttn, chirpstack) : voir docs/IOT.md."""
    fn = iot_adapters.ADAPTERS.get(adapter)
    if fn is None:
        raise ValidationAppError(f"Adaptateur inconnu : {adapter}. Disponibles : {', '.join(iot_adapters.ADAPTERS)}.", code="UNKNOWN_ADAPTER")
    try:
        n = fn(body)
    except iot_adapters.PayloadError as exc:
        raise ValidationAppError(str(exc), code="BAD_PAYLOAD")
    reading, alert = monitoring.ingest(db, n.code, n.samples_cm, n.measured_at)
    return {"sensor": n.code, "water_level_cm": reading.water_level_cm, "level": reading.level, "alert_triggered": alert.level if alert else None}
