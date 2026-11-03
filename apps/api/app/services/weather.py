"""Service météo : collecte automatique, saisie de bulletins officiels, synthèse du risque pluie."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Callable

from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import settings
from app.domain.models import Sensor, WeatherObservation
from app.domain.weather import RainThresholds, WeatherPoint, rain_risk, summarize
from app.infrastructure.weather import open_meteo, openweather
from app.services.weather_grid import (
    GRID_SPACING_KM,
    national_grid_points,
)

log = logging.getLogger(__name__)
Provider = Callable[[float, float], list[WeatherPoint]]
OpenWeatherProvider = Callable[[float, float, str], list[WeatherPoint]]


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
    sensors = db.execute(
        select(Sensor).where(~Sensor.code.like("DEMO-%"))
    ).scalars()
    for sensor in sensors:  # météo locale à chaque capteur
        from geoalchemy2.shape import to_shape
        p = to_shape(sensor.location)
        points.setdefault(point_key(p.y, p.x), (sensor.name, round(p.y, 2), round(p.x, 2)))
    for name, lat, lon in national_grid_points():
        points.setdefault(point_key(lat, lon), (name, lat, lon))
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


def refresh(
    db: Session,
    provider: Provider | None = None,
    openweather_provider: OpenWeatherProvider = openweather.fetch,
) -> dict:
    """Interroge les sources configurées sans empêcher les autres de fonctionner."""
    ok, failed, rows = 0, [], 0
    points = _all_points(db)
    if provider is None:
        fetch_results = open_meteo.fetch_many(points)
        for result in fetch_results:
            name, lat, lon = result.location
            if result.error is not None or result.points is None:
                error = result.error or "InvalidFetchResult"
                log.warning("Open-Meteo indisponible pour %s (%s)", name, error)
                failed.append(name)
                continue
            try:
                rows += store(db, open_meteo.SOURCE, name, lat, lon, result.points)
                ok += 1
            except Exception as exc:  # réseau, quota, format : on continue et on le signale
                db.rollback()
                log.warning(
                    "Open-Meteo indisponible pour %s (%s)",
                    name,
                    type(exc).__name__,
                )
                failed.append(name)
    else:
        for name, lat, lon in points:
            try:
                rows += store(db, open_meteo.SOURCE, name, lat, lon, provider(lat, lon))
                ok += 1
            except Exception as exc:  # réseau, quota, format : on continue et on le signale
                db.rollback()
                log.warning("Open-Meteo indisponible pour %s (%s)", name, type(exc).__name__)
                failed.append(name)
    openweather_ok, openweather_failed = [], []
    api_key = settings.weather_openweather_api_key.strip()
    if api_key:
        grid_points = set(national_grid_points())
        for name, lat, lon in points:
            if (name, lat, lon) in grid_points:
                continue
            try:
                rows += store(
                    db,
                    openweather.SOURCE,
                    name,
                    lat,
                    lon,
                    openweather_provider(lat, lon, api_key),
                )
                openweather_ok.append(name)
            except Exception as exc:
                db.rollback()
                log.warning("OpenWeather indisponible pour %s (%s)", name, type(exc).__name__)
                openweather_failed.append(name)
    return {
        "points_ok": ok,
        "points_failed": failed,
        "openweather_points_ok": openweather_ok,
        "openweather_points_failed": openweather_failed,
        "rows": rows,
    }


def summary(db: Session, now: datetime | None = None) -> list[dict]:
    now = now or datetime.now(timezone.utc)
    stmt = select(WeatherObservation).where(WeatherObservation.valid_at > now - timedelta(hours=24),
                                            WeatherObservation.valid_at <= now + timedelta(hours=3))
    groups: dict[tuple[str, str], dict] = {}
    for o in db.execute(stmt).scalars():
        from geoalchemy2.shape import to_shape
        g = groups.setdefault((o.source, o.point_key), {"name": o.name or o.point_key, "source": o.source,
                              "lat": to_shape(o.location).y, "lon": to_shape(o.location).x,
                              "points": [], "records": [], "updated_at": o.fetched_at})
        g["points"].append((o.valid_at, o.precip_mm))
        g["records"].append(o)
        g["updated_at"] = max(g["updated_at"], o.fetched_at)
    result = []
    for g in groups.values():
        if (
            g["source"] == open_meteo.SOURCE
            and (g["name"] or "").startswith("Démo · Caniveau ")
        ):
            continue
        origin = (
            "weather_model" if g["source"] == open_meteo.SOURCE
            else "provider_report" if g["source"] == openweather.SOURCE
            else "iot_gauge" if g["source"] == "iot-rain-gauge"
            else "bulletin"
        )
        recent_observations = [
            o for o in g["records"]
            if not o.is_forecast
            and g["source"] != open_meteo.SOURCE
            and now - timedelta(hours=2) <= o.valid_at <= now + timedelta(minutes=5)
        ]
        latest_observation = max(recent_observations, key=lambda o: o.valid_at, default=None)
        observed_hourly = {}
        for observation in g["records"]:
            if (
                not observation.is_forecast
                and g["source"] != open_meteo.SOURCE
                and now - timedelta(hours=24) < observation.valid_at <= now
            ):
                hour = observation.valid_at.replace(
                    minute=0, second=0, microsecond=0
                )
                previous = observed_hourly.get(hour)
                if previous is None or observation.valid_at > previous.valid_at:
                    observed_hourly[hour] = observation
        observed_24h = round(
            sum(observation.precip_mm for observation in observed_hourly.values()),
            1,
        )
        modeled_hourly = {}
        for observation in g["records"]:
            if (
                observation.is_forecast
                or g["source"] != open_meteo.SOURCE
                or not now - timedelta(hours=24) < observation.valid_at <= now
            ):
                continue
            hour = observation.valid_at.replace(
                minute=0, second=0, microsecond=0
            )
            previous = modeled_hourly.get(hour)
            if previous is None or observation.valid_at > previous.valid_at:
                modeled_hourly[hour] = observation
        modeled_24h = round(
            sum(observation.precip_mm for observation in modeled_hourly.values()),
            1,
        )
        current_model = max(
            (
                o for o in g["records"]
                if g["source"] == open_meteo.SOURCE
                and not o.is_forecast
                and now - timedelta(hours=2) <= o.valid_at <= now + timedelta(minutes=5)
            ),
            key=lambda o: o.valid_at,
            default=None,
        )
        forecast_intensity = max(
            (o.precip_mm for o in g["records"]
             if o.is_forecast and now < o.valid_at <= now + timedelta(hours=3)),
            default=0.0,
        )
        observed_level = (
            rain_risk(
                latest_observation.precip_mm,
                observed_24h,
                thresholds(),
            )
            if latest_observation
            else None
        )
        modeled_level = (
            rain_risk(current_model.precip_mm, 0, thresholds())
            if current_model
            else None
        )
        forecast_level = rain_risk(forecast_intensity, 0, thresholds())
        summary_values = summarize(g["points"], now, thresholds())
        result.append(
            {
                **{
                    key: g[key]
                    for key in ("name", "source", "lat", "lon", "updated_at")
                },
                **summary_values,
                "level": (
                    observed_level
                    or modeled_level
                    or forecast_level
                ),
                "forecast_level": forecast_level,
                "intensity_3h_mm_h": round(forecast_intensity, 1),
                "forecast_intensity_3h_mm_h": round(forecast_intensity, 1),
                "observed_precip_mm_h": (
                    latest_observation.precip_mm if latest_observation else None
                ),
                "observed_24h_mm": observed_24h,
                "observed_at": (
                    latest_observation.valid_at if latest_observation else None
                ),
                "observed_level": observed_level,
                "modeled_precip_mm_h": (
                    current_model.precip_mm if current_model else None
                ),
                "modeled_at": current_model.valid_at if current_model else None,
                "modeled_24h_mm": modeled_24h,
                "source_kind": origin,
            }
        )
    return sorted(result, key=lambda r: (r["name"], r["source"]))


def source_status(db: Session) -> dict:
    now = datetime.now(timezone.utc)
    latest = dict(
        db.execute(
            select(WeatherObservation.source, func.max(WeatherObservation.fetched_at))
            .group_by(WeatherObservation.source)
        ).all()
    )
    cutoff = timedelta(minutes=max(60, settings.weather_refresh_minutes * 3))

    def provider_state(source: str, enabled: bool) -> dict:
        fetched_at = latest.get(source)
        if not enabled:
            state = "disabled"
        elif fetched_at is None:
            state = "no_data"
        elif now - fetched_at <= cutoff:
            state = "current"
        else:
            state = "stale"
        return {
            "source": source,
            "enabled": enabled,
            "status": state,
            "last_success_at": fetched_at,
        }

    return {
        "coverage": {
            "country": "Côte d'Ivoire",
            "grid_spacing_km": GRID_SPACING_KM,
            "grid_points": len(national_grid_points()),
        },
        "refresh_interval_minutes": settings.weather_refresh_minutes,
        "providers": [
            provider_state(open_meteo.SOURCE, settings.weather_enabled),
            provider_state(
                openweather.SOURCE,
                settings.weather_enabled and bool(settings.weather_openweather_api_key.strip()),
            ),
        ],
        "supplemental_sources": ["bulletin", "iot-rain-gauge"],
    }
