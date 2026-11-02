"""Service météo : collecte automatique, saisie de bulletins officiels, synthèse du risque pluie."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Callable

from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import settings
from app.domain.models import Sensor, WeatherObservation
from app.domain.weather import RainThresholds, WeatherPoint, summarize
from app.infrastructure.weather import open_meteo

log = logging.getLogger(__name__)
Provider = Callable[[float, float], list[WeatherPoint]]


def thresholds() -> RainThresholds:
    return RainThresholds(settings.rain_orange_mm_h, settings.rain_red_mm_h,
                          settings.rain_orange_24h_mm, settings.rain_red_24h_mm)


def point_key(lat: float, lon: float) -> str:
    return f"{lat:.2f},{lon:.2f}"


def configured_points() -> list[tuple[str, float, float]]:
    out = []
    for item in settings.weather_points.split(","):
        try:
            name, lat, lon = item.strip().rsplit(":", 2)
            out.append((name, float(lat), float(lon)))
        except ValueError:
            log.warning("Point météo ignoré (format Nom:lat:lon attendu) : %r", item)
    return out


def _all_points(db: Session) -> list[tuple[str, float, float]]:
    points = {point_key(lat, lon): (name, lat, lon) for name, lat, lon in configured_points()}
    for sensor in db.execute(select(Sensor)).scalars():  # météo locale à chaque capteur
        from geoalchemy2.shape import to_shape
        p = to_shape(sensor.location)
        points.setdefault(point_key(p.y, p.x), (sensor.name, round(p.y, 2), round(p.x, 2)))
    return list(points.values())


def store(db: Session, source: str, name: str | None, lat: float, lon: float, points: list[WeatherPoint]) -> int:
    """Enregistre (insertion ou mise à jour) des points horaires ; idempotent."""
    if not points:
        return 0
    now = datetime.now(timezone.utc)
    rows = [dict(source=source, point_key=point_key(lat, lon), name=name,
                 location=from_shape(Point(lon, lat), srid=4326), valid_at=p.valid_at, precip_mm=p.precip_mm,
                 is_forecast=p.is_forecast, fetched_at=now) for p in points]
    stmt = insert(WeatherObservation).values(rows)
    stmt = stmt.on_conflict_do_update(constraint="uq_weather_point_time", set_={
        "precip_mm": stmt.excluded.precip_mm, "is_forecast": stmt.excluded.is_forecast,
        "fetched_at": stmt.excluded.fetched_at, "name": stmt.excluded.name})
    db.execute(stmt)
    db.commit()
    return len(rows)


def refresh(db: Session, provider: Provider = open_meteo.fetch) -> dict:
    """Interroge le fournisseur pour chaque point. Un échec sur un point n'arrête pas les autres."""
    ok, failed, rows = 0, [], 0
    for name, lat, lon in _all_points(db):
        try:
            rows += store(db, open_meteo.SOURCE, name, lat, lon, provider(lat, lon))
            ok += 1
        except Exception as exc:  # réseau, quota, format : on continue et on le signale
            db.rollback()
            log.warning("Météo indisponible pour %s : %s", name, exc)
            failed.append(name)
    return {"points_ok": ok, "points_failed": failed, "rows": rows}


def summary(db: Session, now: datetime | None = None) -> list[dict]:
    now = now or datetime.now(timezone.utc)
    stmt = select(WeatherObservation).where(WeatherObservation.valid_at > now - timedelta(hours=24),
                                            WeatherObservation.valid_at <= now + timedelta(hours=3))
    groups: dict[tuple[str, str], dict] = {}
    for o in db.execute(stmt).scalars():
        from geoalchemy2.shape import to_shape
        g = groups.setdefault((o.source, o.point_key), {"name": o.name or o.point_key, "source": o.source,
                              "lat": to_shape(o.location).y, "lon": to_shape(o.location).x,
                              "points": [], "updated_at": o.fetched_at})
        g["points"].append((o.valid_at, o.precip_mm))
        g["updated_at"] = max(g["updated_at"], o.fetched_at)
    result = []
    for g in groups.values():
        result.append({**{k: g[k] for k in ("name", "source", "lat", "lon", "updated_at")},
                       **summarize(g["points"], now, thresholds())})
    return sorted(result, key=lambda r: (r["name"], r["source"]))
