"""Fournisseur Open-Meteo (https://open-meteo.com) — données sous licence CC BY 4.0.

Gratuit sans clé pour un usage NON commercial (≈ 10 000 requêtes/jour). Un usage commercial
exige une offre payante ou un serveur Open-Meteo auto-hébergé (voir `base_url`).
"""

import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from app.domain.weather import WeatherPoint

SOURCE = "open-meteo"


def parse(payload: dict, now: datetime) -> list[WeatherPoint]:
    hourly = payload.get("hourly") or {}
    times, values = hourly.get("time") or [], hourly.get("precipitation") or []
    points = []
    for raw, mm in zip(times, values):
        if mm is None:  # donnée absente : on ne l'invente pas
            continue
        ts = datetime.fromisoformat(raw).replace(tzinfo=timezone.utc)
        points.append(WeatherPoint(valid_at=ts, precip_mm=float(mm), is_forecast=ts > now))
    return points


def fetch(lat: float, lon: float, base_url: str = "https://api.open-meteo.com/v1/forecast", timeout: float = 15) -> list[WeatherPoint]:
    query = urllib.parse.urlencode({"latitude": lat, "longitude": lon, "hourly": "precipitation",
                                    "past_days": 1, "forecast_days": 2, "timezone": "UTC"})
    with urllib.request.urlopen(f"{base_url}?{query}", timeout=timeout) as response:  # noqa: S310
        return parse(json.load(response), datetime.now(timezone.utc))
