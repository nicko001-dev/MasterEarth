"""OpenWeather current conditions; API keys are read only from server settings."""

import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from app.domain.weather import WeatherPoint

SOURCE = "openweather"
BASE_URL = "https://api.openweathermap.org/data/2.5/weather"


def parse(payload: dict) -> list[WeatherPoint]:
    if not isinstance(payload, dict):
        raise ValueError("Réponse OpenWeather invalide.")
    try:
        raw_timestamp = payload["dt"]
        if isinstance(raw_timestamp, bool):
            raise TypeError
        timestamp = datetime.fromtimestamp(int(raw_timestamp), tz=timezone.utc)
        rain = payload.get("rain") or {}
        if not isinstance(rain, dict):
            raise TypeError
        precipitation = float(rain.get("1h", 0.0))
    except (KeyError, TypeError, ValueError, OverflowError) as exc:
        raise ValueError("Réponse OpenWeather invalide.") from exc
    if not 0 <= precipitation <= 500:
        raise ValueError(
            "Précipitation OpenWeather hors limites."
        )
    return [
        WeatherPoint(
            valid_at=timestamp,
            precip_mm=precipitation,
            is_forecast=False,
        )
    ]


def fetch(
    lat: float,
    lon: float,
    api_key: str,
    timeout: float = 15,
) -> list[WeatherPoint]:
    query = urllib.parse.urlencode(
        {"lat": lat, "lon": lon, "appid": api_key, "units": "metric"}
    )
    request = urllib.request.Request(
        f"{BASE_URL}?{query}",
        headers={"Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
            payload = json.load(response)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"OpenWeather a répondu avec HTTP {exc.code}.") from None
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise RuntimeError("OpenWeather est indisponible.") from exc
    if not isinstance(payload, dict):
        raise ValueError("Réponse OpenWeather invalide.")
    return parse(payload)
