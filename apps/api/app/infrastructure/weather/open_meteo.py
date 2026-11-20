"""Fournisseur Open-Meteo, sous licence CC BY 4.0.

Gratuit sans clé pour un usage non commercial (≈ 10 000 requêtes/jour). Un usage
commercial exige une offre payante ou un serveur Open-Meteo auto-hébergé.

Le quota quotidien est compté par hôte et par adresse IP : quand l'hôte
principal ``api.open-meteo.com`` renvoie 429, l'hôte secondaire
``historical-forecast-api.open-meteo.com`` (même licence, quota distinct) sert
de repli. La valeur ``current.precipitation`` de ce second hôte reste issue du
même modèle météo — c'est donc une estimation modélisée, pas une mesure terrain.
"""

import email.utils
import json
import math
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone

from app.domain.weather import WeatherPoint

SOURCE = "open-meteo"
MAX_LOCATIONS_PER_REQUEST = 100

FORECAST_BASE_URL = "https://api.open-meteo.com/v1/forecast"
FALLBACK_FORECAST_BASE_URL = "https://historical-forecast-api.open-meteo.com/v1/forecast"
# Hôtes interrogeables pour la précipitation courante, dans l'ordre de préférence.
CURRENT_BASE_URLS = (FORECAST_BASE_URL, FALLBACK_FORECAST_BASE_URL)
# Plafond du refroidissement d'un hôte (Retry-After peut annoncer « demain »).
RETRY_AFTER_CAP_SECONDS = 6 * 3600
RETRY_AFTER_MIN_SECONDS = 30


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


# --- Précipitation courante : requête allégée + repli multi-hôtes -------------

_current_host_cooldown: dict[str, float] = {}
_current_host_lock = threading.Lock()
_last_current_host: str | None = None


def _host_available(url: str) -> bool:
    """Un hôte refroidi (429 + Retry-After) n'est plus interrogé inutilement."""
    with _current_host_lock:
        return _current_host_cooldown.get(url, 0.0) <= time.monotonic()


def _cooldown_host(url: str, retry_after_seconds: float) -> None:
    seconds = min(max(retry_after_seconds, RETRY_AFTER_MIN_SECONDS), RETRY_AFTER_CAP_SECONDS)
    with _current_host_lock:
        _current_host_cooldown[url] = time.monotonic() + seconds


def _retry_after_seconds(headers) -> float:
    raw = headers.get("Retry-After") if headers is not None else None
    if raw is None:
        return RETRY_AFTER_MIN_SECONDS
    try:
        return float(raw)
    except (TypeError, ValueError):
        try:
            target = email.utils.parsedate_to_datetime(raw)
        except (TypeError, ValueError):
            return RETRY_AFTER_MIN_SECONDS
        if target.tzinfo is None:
            target = target.replace(tzinfo=timezone.utc)
        return max(0.0, (target - datetime.now(timezone.utc)).total_seconds())


def current_host() -> str | None:
    """Hôte qui a répondu au dernier scan courant (traçabilité de la donnée)."""
    with _current_host_lock:
        return _last_current_host


def _fetch_current_batch(
    batch: list[tuple[str, float, float]],
    base_url: str,
    timeout: float,
) -> list[FetchResult] | None:
    """Un lot sur un hôte ; ``None`` quand l'hôte est inutilisable."""
    query = urllib.parse.urlencode(
        {
            "latitude": ",".join(str(lat) for _, lat, _ in batch),
            "longitude": ",".join(str(lon) for _, _, lon in batch),
            "current": "precipitation",
            "timezone": "UTC",
        }
    )
    try:
        with urllib.request.urlopen(
            f"{base_url}?{query}", timeout=timeout
        ) as response:  # noqa: S310
            payload = json.load(response)
    except urllib.error.HTTPError as exc:
        if exc.code == 429:
            _cooldown_host(base_url, _retry_after_seconds(exc.headers))
        return None
    except (OSError, TypeError, ValueError):
        return None

    if isinstance(payload, dict) and len(batch) == 1:
        payloads = [payload]
    elif (
        isinstance(payload, list)
        and len(payload) == len(batch)
        and all(isinstance(item, dict) for item in payload)
    ):
        payloads = payload
    else:
        return None

    fetched_at = datetime.now(timezone.utc)
    results: list[FetchResult] = []
    for location, item in zip(batch, payloads, strict=True):
        try:
            results.append(FetchResult(location, parse(item, fetched_at)))
        except (TypeError, ValueError) as exc:
            results.append(FetchResult(location, None, type(exc).__name__))
    # 200 sans aucune valeur courante exploitable ≈ hôte inutile : on tente le
    # suivant au lieu de compter tout le lot comme inconnu.
    if not any(
        result.points and any(not point.is_forecast for point in result.points)
        for result in results
    ):
        return None
    with _current_host_lock:
        global _last_current_host
        _last_current_host = base_url
    return results


def fetch_current_many(
    locations: list[tuple[str, float, float]],
    base_urls: tuple[str, ...] = CURRENT_BASE_URLS,
    timeout: float = 20,
) -> list[FetchResult]:
    """Précipitation **courante** uniquement, avec repli d'hôte et refroidissement.

    Contrairement à ``fetch_many``, aucune série horaire n'est demandée : pour
    compter les points en pluie, seule ``current.precipitation`` est utilisée.
    Chaque lot essaie l'hôte principal puis l'hôte de repli ; un 429 met
    l'hôte de côté pendant le ``Retry-After`` indiqué (plafonné).
    """
    results: list[FetchResult] = []
    urls = tuple(base_urls) or (FORECAST_BASE_URL,)
    for offset in range(0, len(locations), MAX_LOCATIONS_PER_REQUEST):
        batch = locations[offset : offset + MAX_LOCATIONS_PER_REQUEST]
        batch_results: list[FetchResult] | None = None
        for base_url in urls:
            if not _host_available(base_url):
                continue
            batch_results = _fetch_current_batch(batch, base_url, timeout)
            if batch_results is not None:
                break
        if batch_results is None:
            results.extend(
                FetchResult(location, None, "Unavailable") for location in batch
            )
        else:
            results.extend(batch_results)
    return results


def reset_current_state() -> None:
    """Tests : ni refroidissement, ni hôte mémorisé."""
    with _current_host_lock:
        _current_host_cooldown.clear()
        global _last_current_host
        _last_current_host = None
