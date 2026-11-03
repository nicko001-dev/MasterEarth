"""API v1 : capteurs, mesures et alertes."""

from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from app.api import auth_deps
from app.core.exceptions import ValidationAppError
from app.domain import iot_adapters
from app.domain.models import User
from app.domain.weather import WeatherPoint
from app.infrastructure.db.session import get_db_session
from app.services import accounts, monitoring, weather

router = APIRouter(prefix="/api/v1", tags=["monitoring"])
DistanceSample = Annotated[float, Field(gt=0, lt=1000, allow_inf_nan=False)]


class SensorIn(BaseModel):
    code: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    name: str = Field(min_length=1, max_length=255)
    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)
    mount_height_cm: Optional[float] = Field(default=None, gt=0, le=1000)
    kind: Literal["water_level", "rain_gauge"] = "water_level"
    bankfull_cm: Optional[float] = Field(default=None, gt=0, le=1000, description="Niveau de débordement du canal (cm).")

    @model_validator(mode="after")
    def require_water_sensor_height(self) -> "SensorIn":
        if self.kind == "water_level" and self.mount_height_cm is None:
            raise ValueError("La hauteur de fixation est requise pour un capteur de niveau d'eau.")
        if self.kind == "rain_gauge":
            if self.mount_height_cm is not None:
                raise ValueError("La hauteur de fixation ne s'applique pas à un pluviomètre.")
            if self.bankfull_cm is not None:
                raise ValueError("Le seuil de débordement ne s'applique pas à un pluviomètre.")
        return self


class ReadingIn(BaseModel):
    samples_cm: list[DistanceSample] = Field(
        min_length=1,
        max_length=50,
        description="Rafale de distances mesurées (cm), strictement entre 0 et 1000.",
    )
    measured_at: Optional[datetime] = None


class RainfallIn(BaseModel):
    precip_mm: float = Field(ge=0, le=500, allow_inf_nan=False, description="Cumul de pluie sur l'heure écoulée (mm).")
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


@router.post("/sensors/{code}/rainfall", status_code=201)
def ingest_rainfall(
    code: str,
    body: RainfallIn,
    _who: str = Depends(auth_deps.device_or_operator),
    db: Session = Depends(get_db_session),
) -> dict:
    sensor = monitoring.get_sensor(db, code)
    if sensor.kind != "rain_gauge":
        raise ValidationAppError(
            f"Le capteur « {code} » n'est pas un pluviomètre.",
            code="SENSOR_TYPE_MISMATCH",
        )
    when = body.measured_at or datetime.now(timezone.utc)
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    if when > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise ValidationAppError(
            "L'horodatage du pluviomètre ne peut pas être dans le futur.",
            code="FUTURE_MEASUREMENT",
        )
    from geoalchemy2.shape import to_shape

    point = to_shape(sensor.location)
    stored = weather.store(
        db,
        "iot-rain-gauge",
        sensor.name,
        point.y,
        point.x,
        [WeatherPoint(valid_at=when, precip_mm=body.precip_mm, is_forecast=False)],
    )
    return {
        "sensor": sensor.code,
        "measured_at": when,
        "precip_mm": body.precip_mm,
        "stored": stored,
    }


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
