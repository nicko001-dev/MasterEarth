"""Service de surveillance : capteurs, ingestion des mesures, alertes."""

from datetime import datetime, timezone

from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import Point
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.domain import alerting, sensor_health
from app.domain.models import Alert, Reading, Sensor, WeatherObservation

LABELS = {"green": "Vert", "orange": "Orange", "red": "Rouge"}


def thresholds() -> alerting.Thresholds:
    return alerting.Thresholds(
        orange_cm=settings.alert_orange_cm,
        red_cm=settings.alert_red_cm,
        orange_rise_cm_min=settings.alert_orange_rise_cm_min,
        red_rise_cm_min=settings.alert_red_rise_cm_min,
        persistence_cycles=settings.alert_persistence_cycles,
    )


def format_alert_message(
    sensor_name: str,
    level: str,
    water_level_cm: float,
    previous_level: str,
) -> str:
    if level == "green" and previous_level != "green":
        return (
            f"Alerte terminée pour {sensor_name} : le niveau est revenu à Vert "
            f"({water_level_cm:.0f} cm)."
        )
    return f"{sensor_name} : niveau {LABELS[level]} ({water_level_cm:.0f} cm)"


def get_sensor(db: Session, code: str) -> Sensor:
    sensor = db.execute(select(Sensor).where(Sensor.code == code)).scalar_one_or_none()
    if sensor is None:
        raise NotFoundError(f"Capteur « {code} » introuvable.", code="SENSOR_NOT_FOUND")
    return sensor


def create_sensor(db: Session, code: str, name: str, lon: float, lat: float, mount_height_cm: float | None, kind: str = "water_level", bankfull_cm: float | None = None) -> Sensor:
    if kind == "rain_gauge":
        # The legacy non-null water-sensor field is unused for rain gauges.
        mount_height_cm = 0.0
        bankfull_cm = None
    if mount_height_cm is None:
        raise ValueError("La hauteur de fixation est requise pour un capteur de niveau d'eau.")
    sensor = Sensor(code=code, name=name, mount_height_cm=mount_height_cm, kind=kind, bankfull_cm=bankfull_cm,
                    location=from_shape(Point(lon, lat), srid=4326))
    db.add(sensor)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ConflictError(f"Le capteur « {code} » existe déjà.", code="SENSOR_EXISTS")
    return sensor


def _last_reading(db: Session, sensor_id: int) -> Reading | None:
    stmt = select(Reading).where(Reading.sensor_id == sensor_id).order_by(Reading.measured_at.desc()).limit(1)
    return db.execute(stmt).scalar_one_or_none()


def ingest(db: Session, code: str, samples: list[float], measured_at: datetime | None) -> tuple[Reading, Alert | None]:
    """Enregistre une rafale de relevés : médiane, niveau, vitesse de montée, persistance."""
    sensor = get_sensor(db, code)
    if sensor.kind != "water_level":
        raise ValidationAppError(
            f"Le capteur « {code} » est un pluviomètre, pas un capteur de niveau d'eau.",
            code="SENSOR_TYPE_MISMATCH",
        )
    t = thresholds()
    when = measured_at or datetime.now(timezone.utc)
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    distance = alerting.median_distance(samples)
    level_cm = alerting.water_level_cm(sensor.mount_height_cm, distance)
    previous = _last_reading(db, sensor.id)
    rise = 0.0
    if previous is not None:
        minutes = (when - previous.measured_at).total_seconds() / 60
        if minutes > 0:
            rise = max(0.0, (level_cm - previous.water_level_cm) / minutes)
    reading = Reading(sensor_id=sensor.id, measured_at=when, distance_cm=distance,
                      water_level_cm=level_cm, rise_cm_min=rise,
                      level=alerting.classify(level_cm, rise, t))
    db.add(reading)
    db.flush()
    recent = db.execute(select(Reading.level).where(Reading.sensor_id == sensor.id)
                        .order_by(Reading.measured_at.desc()).limit(t.persistence_cycles)).scalars().all()
    confirmed = alerting.confirmed_level(list(recent), t)
    last_alert = db.execute(select(Alert).where(Alert.sensor_id == sensor.id)
                            .order_by(Alert.triggered_at.desc(), Alert.id.desc()).limit(1)).scalar_one_or_none()
    previous_level = last_alert.level if last_alert else "green"
    alert = None
    if confirmed != previous_level:  # pas de doublon : une alerte par changement de niveau confirmé
        alert = Alert(sensor_id=sensor.id, level=confirmed, water_level_cm=level_cm, triggered_at=when,
                      message=format_alert_message(sensor.name, confirmed, level_cm, previous_level))
        db.add(alert)
    db.commit()
    return reading, alert


def sensor_state(db: Session, sensor: Sensor) -> dict:
    point = to_shape(sensor.location)
    last = _last_reading(db, sensor.id)
    rain = None
    rain_at = None
    if sensor.kind == "rain_gauge":
        rain_row = db.execute(
            select(WeatherObservation)
            .where(
                WeatherObservation.source == "iot-rain-gauge",
                WeatherObservation.point_key == f"{point.y:.2f},{point.x:.2f}",
            )
            .order_by(WeatherObservation.valid_at.desc())
            .limit(1)
        ).scalar_one_or_none()
        if rain_row is not None:
            rain = rain_row.precip_mm
            rain_at = rain_row.valid_at
    alert = db.execute(select(Alert).where(Alert.sensor_id == sensor.id)
                       .order_by(Alert.triggered_at.desc(), Alert.id.desc()).limit(1)).scalar_one_or_none()
    health = sensor_health.evaluate_sensor_health(
        rain_at if sensor.kind == "rain_gauge" else (last.measured_at if last else None),
        settings.sensor_stale_minutes,
    )
    return {"code": sensor.code, "name": sensor.name, "kind": sensor.kind, "lon": point.x, "lat": point.y, "status": sensor.status, "bankfull_cm": sensor.bankfull_cm,
            "alert_level": alert.level if alert else "green",
            "water_level_cm": last.water_level_cm if last and sensor.kind == "water_level" else None,
            "rain_mm_h": rain,
            "last_measured_at": rain_at if sensor.kind == "rain_gauge" else (last.measured_at if last else None),
            "health_status": health.status,
            "minutes_since_last_reading": health.minutes_since_last_reading}


def list_sensors(db: Session) -> list[dict]:
    sensors = db.execute(
        select(Sensor)
        .where(~Sensor.code.like("DEMO-%"))
        .order_by(Sensor.code)
    ).scalars()
    return [sensor_state(db, sensor) for sensor in sensors]


def list_alerts(db: Session, limit: int = 50) -> list[dict]:
    rows = db.execute(
        select(Alert, Sensor.code)
        .join(Sensor)
        .where(~Sensor.code.like("DEMO-%"))
        .order_by(Alert.triggered_at.desc(), Alert.id.desc())
        .limit(limit)
    ).all()
    return [{"id": a.id, "sensor_code": c, "level": a.level, "water_level_cm": a.water_level_cm,
             "triggered_at": a.triggered_at, "message": a.message} for a, c in rows]


def list_readings(db: Session, code: str, limit: int = 100) -> list[Reading]:
    sensor = get_sensor(db, code)
    stmt = select(Reading).where(Reading.sensor_id == sensor.id).order_by(Reading.measured_at.desc()).limit(limit)
    return list(db.execute(stmt).scalars())
