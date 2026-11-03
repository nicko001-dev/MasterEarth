"""Fournisseur Open-Meteo, sous licence CC BY 4.0.

Gratuit sans clé pour un usage non commercial (≈ 10 000 requêtes/jour). Un usage
commercial exige une offre payante ou un serveur Open-Meteo auto-hébergé.
"""

import json
import math
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone

from app.domain.weather import WeatherPoint

SOURCE = "open-meteo"
MAX_LOCATIONS_PER_REQUEST = 100


@dataclass(frozen=True)
class FetchResult:
    location: tuple[str, float, float]
    points: list[WeatherPoint] | None
    error: str | None = None


def parse(payload: dict, now: datetime) -> list[WeatherPoint]:
    if not isinstance(payload, dict) or payload.get("error"):
        raise ValueError("Réponse Open-Meteo invalide.")
    hourly = payload.get("hourly") or {}
    if not isinstance(hourly, dict):
        raise ValueError("Réponse Open-Meteo invalide.")
    times, values = hourly.get("time") or [], hourly.get("precipitation") or []
    points_by_time: dict[datetime, WeatherPoint] = {}
    for raw, mm in zip(times, values, strict=True):
        if mm is None:  # donnée absente : on ne l'invente pas
            continue
        ts = _parse_time(raw)
        points_by_time[ts] = WeatherPoint(
            valid_at=ts,
            precip_mm=_parse_precipitation(mm),
            is_forecast=ts > now,
        )

    current = payload.get("current") or {}
    if not isinstance(current, dict):
        raise ValueError("Réponse Open-Meteo invalide.")
    if current.get("precipitation") is not None and current.get("time"):
        ts = _parse_time(current["time"])
        points_by_time[ts] = WeatherPoint(
            valid_at=ts,
            precip_mm=_parse_precipitation(current["precipitation"]),
            is_forecast=False,
        )

    return [points_by_time[ts] for ts in sorted(points_by_time)]


def _parse_time(raw: str) -> datetime:
    timestamp = datetime.fromisoformat(raw)
    if timestamp.tzinfo is None:
        return timestamp.replace(tzinfo=timezone.utc)
    return timestamp.astimezone(timezone.utc)


def _parse_precipitation(raw: object) -> float:
    try:
        precipitation = float(raw)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError("Réponse Open-Meteo invalide.") from exc
    if not math.isfinite(precipitation) or not 0 <= precipitation <= 500:
        raise ValueError("Précipitation Open-Meteo hors limites.")
    return precipitation


def fetch(
    lat: float,
    lon: float,
    base_url: str = "https://api.open-meteo.com/v1/forecast",
    timeout: float = 15,
) -> list[WeatherPoint]:
    query = urllib.parse.urlencode(
        {
            "latitude": lat,
            "longitude": lon,
            "current": "precipitation",
            "hourly": "precipitation",
            "past_days": 1,
            "forecast_days": 2,
            "timezone": "UTC",
        }
    )
    with urllib.request.urlopen(f"{base_url}?{query}", timeout=timeout) as response:  # noqa: S310
        return parse(json.load(response), datetime.now(timezone.utc))


def fetch_many(
    locations: list[tuple[str, float, float]],
    base_url: str = "https://api.open-meteo.com/v1/forecast",
    timeout: float = 15,
) -> list[FetchResult]:
    """Fetch multiple locations in bounded requests, preserving per-point errors."""
    results = []
    for offset in range(0, len(locations), MAX_LOCATIONS_PER_REQUEST):
        batch = locations[offset : offset + MAX_LOCATIONS_PER_REQUEST]
        query = urllib.parse.urlencode(
            {
                "latitude": ",".join(str(lat) for _, lat, _ in batch),
                "longitude": ",".join(str(lon) for _, _, lon in batch),
                "current": "precipitation",
                "hourly": "precipitation",
                "past_days": 1,
                "forecast_days": 2,
                "timezone": "UTC",
            }
        )
        try:
            with urllib.request.urlopen(
                f"{base_url}?{query}", timeout=timeout
            ) as response:  # noqa: S310
                payload = json.load(response)
            if isinstance(payload, dict) and len(batch) == 1:
                payloads = [payload]
            elif (
                isinstance(payload, list)
                and len(payload) == len(batch)
                and all(isinstance(item, dict) for item in payload)
            ):
                payloads = payload
            else:
                raise ValueError("Réponse groupée Open-Meteo invalide.")
        except (OSError, TypeError, ValueError) as exc:
            results.extend(
                FetchResult(location, None, type(exc).__name__) for location in batch
            )
            continue

        fetched_at = datetime.now(timezone.utc)
        for location, item in zip(batch, payloads, strict=True):
            try:
                results.append(FetchResult(location, parse(item, fetched_at)))
            except (TypeError, ValueError) as exc:
                results.append(FetchResult(location, None, type(exc).__name__))
    return results
