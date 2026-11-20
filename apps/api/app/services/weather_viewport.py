"""Sondages météo mondiaux à la demande pour une emprise cartographique.

La collecte périodique garde ses points ancrés (`app.services.weather_sampling`),
calés sur la Côte d'Ivoire. Ce module fournit la vue mondiale bornée : Open-Meteo
n'est interrogé que pour l'emprise demandée, les points sont alignés sur un
calage global afin de réutiliser le cache, et rien n'est écrit en base. Seuls des
points de mesure isolés sont rendus, jamais un réseau de lignes ou de cellules.
"""

import logging
import math
import threading
import time
from collections import OrderedDict, defaultdict, deque
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.core.exceptions import ValidationAppError
from app.domain.weather import RainThresholds, WeatherPoint, rain_risk, summarize
from app.infrastructure.weather import open_meteo
from app.infrastructure.weather.open_meteo import FetchResult
from app.services.weather import thresholds

log = logging.getLogger(__name__)

FetchProvider = Callable[[list[tuple[str, float, float]]], list[FetchResult]]
CacheKey = tuple[float, float, float, float, float]

DEFAULT_SPACING_KM = 250.0
MAX_POINTS = 60
# Surface de la Terre (~510,1 millions de km²) : la vue mondiale entière est
# acceptée. Le pas des sondages s'élargit pour rester sous MAX_POINTS.
MAX_BBOX_AREA_KM2 = 510_100_000.0
MIN_LATITUDE = -90.0
MAX_LATITUDE = 90.0
MIN_LONGITUDE = -180.0
MAX_LONGITUDE = 180.0
CACHE_TTL_SECONDS = 600
CACHE_MAX_ENTRIES = 64
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 20

_KM_PER_DEGREE = 111.32
_EARTH_RADIUS_KM = 6371.0088
_LATITUDE_SPAN = MAX_LATITUDE - MIN_LATITUDE
_LONGITUDE_SPAN = MAX_LONGITUDE - MIN_LONGITUDE
_REFERENCE_LATITUDE_BAND = 5.0
_MAX_SPACING_ATTEMPTS = 12
_MAX_TRACKED_CLIENTS = 10_000

LIMITATIONS = (
    "Modèle Open-Meteo : estimation régionale, pas une mesure terrain. "
    "Le pas s'élargit jusqu'à ~4 000 km pour une vue mondiale.",
    "Prévisions et valeurs passées restent séparées; rien ne prouve une inondation.",
    "Cache mémoire de 10 minutes : la réponse n'est pas un flux temps réel garanti.",
    "Aucune écriture en base : ces points ne sont ni pluviomètres ni observations.",
)


@dataclass(frozen=True)
class _Sampling:
    """Jeu de points alignés sur le monde et borné en nombre."""

    south: float
    west: float
    north: float
    east: float
    spacing_km: float
    points: tuple[tuple[str, float, float], ...]

    @property
    def cache_key(self) -> CacheKey:
        """Clé stable : emprise alignée (et non l'emprise brute) + espacement."""
        return (
            round(self.south, 3),
            round(self.west, 3),
            round(self.north, 3),
            round(self.east, 3),
            round(self.spacing_km, 2),
        )


@dataclass(frozen=True)
class _Sample:
    """Résultat mis en cache pour une emprise donnée."""

    generated_at: datetime
    spacing_km: float
    points: tuple[dict, ...]
    degraded: bool
    failed_points: int


def point_name(latitude: float, longitude: float) -> str:
    """Nom de point attendu par la carte météo."""
    return f"Open-Meteo {latitude:.2f},{longitude:.2f}"


def bbox_area_km2(south: float, west: float, north: float, east: float) -> float:
    """Aire approchée de l'emprise sur une sphère, en km²."""
    latitudes = math.sin(math.radians(north)) - math.sin(math.radians(south))
    return abs(_EARTH_RADIUS_KM**2 * latitudes * math.radians(east - west))


def validate_bbox(south: float, west: float, north: float, east: float) -> None:
    """Vérifie l'emprise demandée; échoue en 422 avec un message français."""
    if not (MIN_LATITUDE <= south <= MAX_LATITUDE) or not (
        MIN_LATITUDE <= north <= MAX_LATITUDE
    ):
        raise ValidationAppError(
            "La latitude doit être comprise entre -90 et 90 degrés."
        )
    if not (MIN_LONGITUDE <= west <= MAX_LONGITUDE) or not (
        MIN_LONGITUDE <= east <= MAX_LONGITUDE
    ):
        raise ValidationAppError(
            "La longitude doit être comprise entre -180 et 180 degrés."
        )
    if west >= east:
        raise ValidationAppError(
            "La longitude ouest doit être strictement inférieure à la longitude "
            "est (le franchissement de l'antiméridien n'est pas pris en charge)."
        )
    if south >= north:
        raise ValidationAppError(
            "La latitude sud doit être strictement inférieure à la latitude nord."
        )
    area = bbox_area_km2(south, west, north, east)
    if area > MAX_BBOX_AREA_KM2:
        raise ValidationAppError(
            f"Emprise trop grande ({area / 1_000_000:.1f} millions de km²) : la "
            "limite couvre la surface terrestre. Vérifiez les coordonnées."
        )


def _clean(value: float) -> float:
    """Arrondit une coordonnée et évite la valeur -0.0 dans les noms."""
    rounded = round(value, 3)
    return 0.0 if rounded == 0 else rounded


def _longitude_step_degrees(spacing_km: float, south: float, north: float) -> float:
    """Pas de longitude adapté à la latitude de l'emprise (calage mondial)."""
    band = round(((south + north) / 2) / _REFERENCE_LATITUDE_BAND)
    reference = max(-85.0, min(85.0, band * _REFERENCE_LATITUDE_BAND))
    distance = _KM_PER_DEGREE * max(math.cos(math.radians(reference)), 0.01)
    return spacing_km / distance


def _build_sampling(
    south: float, west: float, north: float, east: float, spacing_km: float
) -> _Sampling:
    latitude_rows = max(1, round(_LATITUDE_SPAN / (spacing_km / _KM_PER_DEGREE)))
    latitude_step = _LATITUDE_SPAN / latitude_rows
    longitude_columns = max(
        1, round(_LONGITUDE_SPAN / _longitude_step_degrees(spacing_km, south, north))
    )
    longitude_step = _LONGITUDE_SPAN / longitude_columns

    first_row = max(0, math.floor((south - MIN_LATITUDE) / latitude_step))
    last_row = min(latitude_rows, math.ceil((north - MIN_LATITUDE) / latitude_step))
    first_column = math.floor((west - MIN_LONGITUDE) / longitude_step)
    last_column = min(
        longitude_columns - 1,
        math.ceil((east - MIN_LONGITUDE) / longitude_step) - 1,
    )

    latitudes = [
        _clean(MIN_LATITUDE + row * latitude_step)
        for row in range(first_row, last_row + 1)
    ]
    longitudes = [
        _clean(MIN_LONGITUDE + column * longitude_step)
        for column in range(first_column, last_column + 1)
    ]
    points: dict[str, tuple[str, float, float]] = {}
    for latitude in latitudes:
        for longitude in longitudes:
            name = point_name(latitude, longitude)
            points[name] = (name, latitude, longitude)
    centre_latitude = _clean((south + north) / 2)
    centre_longitude = _clean((west + east) / 2)
    centre_name = point_name(centre_latitude, centre_longitude)
    points.setdefault(centre_name, (centre_name, centre_latitude, centre_longitude))

    ordered = tuple(sorted(points.values(), key=lambda point: (point[1], point[2])))
    return _Sampling(
        south=_clean(MIN_LATITUDE + first_row * latitude_step),
        west=_clean(MIN_LONGITUDE + first_column * longitude_step),
        north=_clean(MIN_LATITUDE + last_row * latitude_step),
        east=_clean(MIN_LONGITUDE + last_column * longitude_step),
        spacing_km=round(spacing_km, 1),
        points=ordered,
    )


def _trim_sampling(sampling: _Sampling) -> _Sampling:
    """Sécurité : ne garde que les points les plus proches du centre."""
    centre_latitude = (sampling.south + sampling.north) / 2
    centre_longitude = (sampling.west + sampling.east) / 2

    def distance(point: tuple[str, float, float]) -> float:
        return math.hypot(point[1] - centre_latitude, point[2] - centre_longitude)

    nearest = sorted(sampling.points, key=distance)[:MAX_POINTS]
    ordered = tuple(sorted(nearest, key=lambda point: (point[1], point[2])))
    return _Sampling(
        south=sampling.south,
        west=sampling.west,
        north=sampling.north,
        east=sampling.east,
        spacing_km=sampling.spacing_km,
        points=ordered,
    )


def _select_sampling(
    south: float, west: float, north: float, east: float
) -> _Sampling:
    """Aligne l'emprise sur le calage mondial et borne le nombre de points."""
    spacing_km = DEFAULT_SPACING_KM
    sampling = _build_sampling(south, west, north, east, spacing_km)
    for _ in range(_MAX_SPACING_ATTEMPTS):
        if len(sampling.points) <= MAX_POINTS:
            return sampling
        growth = math.sqrt(len(sampling.points) / MAX_POINTS) * 1.05
        spacing_km *= max(1.1, growth)
        sampling = _build_sampling(south, west, north, east, spacing_km)
    return _trim_sampling(sampling)


_cache: OrderedDict[CacheKey, tuple[float, _Sample]] = OrderedDict()
_cache_lock = threading.Lock()


def _cache_get(key: CacheKey) -> _Sample | None:
    now = time.monotonic()
    with _cache_lock:
        entry = _cache.get(key)
        if entry is None:
            return None
        stored_at, sample = entry
        if now - stored_at > CACHE_TTL_SECONDS:
            _cache.pop(key, None)
            return None
        _cache.move_to_end(key)
        return sample


def _cache_set(key: CacheKey, sample: _Sample) -> None:
    with _cache_lock:
        _cache[key] = (time.monotonic(), sample)
        _cache.move_to_end(key)
        while len(_cache) > CACHE_MAX_ENTRIES:
            _cache.popitem(last=False)


def reset_cache() -> None:
    """Vide le cache (tests et diagnostics uniquement)."""
    with _cache_lock:
        _cache.clear()


_requests: dict[str, deque[float]] = defaultdict(deque)
_requests_lock = threading.Lock()


def allow_request(client_host: str) -> bool:
    """Au plus 20 requêtes par minute et par hôte, en mémoire du processus."""
    now = time.monotonic()
    with _requests_lock:
        recent = _requests[client_host]
        while recent and now - recent[0] >= RATE_LIMIT_WINDOW_SECONDS:
            recent.popleft()
        if len(recent) >= RATE_LIMIT_MAX_REQUESTS:
            return False
        recent.append(now)
        if len(_requests) > _MAX_TRACKED_CLIENTS:
            for stale_host in [
                host
                for host, stamps in _requests.items()
                if not stamps or now - stamps[-1] >= RATE_LIMIT_WINDOW_SECONDS
            ]:
                _requests.pop(stale_host, None)
        return True


def reset_rate_limit() -> None:
    """Vide le compteur anti-abus (tests et diagnostics uniquement)."""
    with _requests_lock:
        _requests.clear()


def _index_results(
    results: list[FetchResult] | None,
) -> tuple[dict[str, FetchResult], dict[tuple[float, float], FetchResult]]:
    by_name: dict[str, FetchResult] = {}
    by_coordinate: dict[tuple[float, float], FetchResult] = {}
    for result in results or ():
        name, latitude, longitude = result.location
        by_name[name] = result
        by_coordinate[(_clean(latitude), _clean(longitude))] = result
    return by_name, by_coordinate


def _point_item(
    name: str,
    latitude: float,
    longitude: float,
    points: list[WeatherPoint],
    now: datetime,
    rain_thresholds: RainThresholds,
) -> dict:
    """Construit un élément du contrat `WeatherItem` pour un point Open-Meteo."""
    forecast = summarize(
        [(point.valid_at, point.precip_mm) for point in points if point.is_forecast],
        now,
        rain_thresholds,
    )
    forecast_intensity = forecast["intensity_3h_mm_h"]

    modeled = max(
        (
            point
            for point in points
            if not point.is_forecast
            and point.valid_at <= now + timedelta(minutes=5)
        ),
        key=lambda point: point.valid_at,
        default=None,
    )
    hourly: dict[datetime, WeatherPoint] = {}
    for point in points:
        if point.is_forecast or not now - timedelta(hours=24) < point.valid_at <= now:
            continue
        hour = point.valid_at.replace(minute=0, second=0, microsecond=0)
        previous = hourly.get(hour)
        if previous is None or point.valid_at > previous.valid_at:
            hourly[hour] = point
    modeled_24h = round(sum(point.precip_mm for point in hourly.values()), 1)
    modeled_level = (
        rain_risk(modeled.precip_mm, 0, rain_thresholds) if modeled else None
    )
    forecast_level = rain_risk(forecast_intensity, 0, rain_thresholds)
    return {
        "name": name,
        "source": open_meteo.SOURCE,
        "lat": latitude,
        "lon": longitude,
        "updated_at": now.isoformat(),
        "intensity_3h_mm_h": forecast_intensity,
        "forecast_intensity_3h_mm_h": forecast_intensity,
        "observed_precip_mm_h": None,
        "observed_24h_mm": 0.0,
        "observed_at": None,
        "observed_level": None,
        "modeled_precip_mm_h": modeled.precip_mm if modeled else None,
        "modeled_at": modeled.valid_at.isoformat() if modeled else None,
        "modeled_24h_mm": modeled_24h,
        "forecast_level": forecast_level,
        "source_kind": "weather_model",
        "accumulated_24h_mm": modeled_24h,
        "level": modeled_level or forecast_level,
    }


def _sample(
    sampling: _Sampling,
    provider: FetchProvider | None,
    now: datetime,
    rain_thresholds: RainThresholds,
) -> _Sample:
    fetch = provider or open_meteo.fetch_many
    try:
        results = fetch(list(sampling.points))
    except Exception as exc:  # réseau, quota, format : dégradé, pas d'erreur 500
        log.warning(
            "Open-Meteo indisponible pour l'emprise (%s)", type(exc).__name__
        )
        return _Sample(now, sampling.spacing_km, (), True, len(sampling.points))

    by_name, by_coordinate = _index_results(results)
    items = []
    failed = 0
    for name, latitude, longitude in sampling.points:
        result = by_name.get(name) or by_coordinate.get(
            (_clean(latitude), _clean(longitude))
        )
        if result is None or result.error is not None or result.points is None:
            failed += 1
            continue
        items.append(
            _point_item(
                name, latitude, longitude, result.points, now, rain_thresholds
            )
        )
    return _Sample(
        generated_at=now,
        spacing_km=sampling.spacing_km,
        points=tuple(items),
        degraded=not items,
        failed_points=failed,
    )


def _payload(
    south: float, west: float, north: float, east: float, sample: _Sample
) -> dict:
    payload = {
        "generated_at": sample.generated_at.isoformat(),
        "bbox": {
            "south": round(south, 4),
            "west": round(west, 4),
            "north": round(north, 4),
            "east": round(east, 4),
        },
        "spacing_km": round(sample.spacing_km, 1),
        "points": [dict(item) for item in sample.points],
        "degraded": sample.degraded,
        "failed_points": sample.failed_points,
        "attribution": "Open-Meteo (CC BY 4.0)",
        "limitations": list(LIMITATIONS),
    }
    if sample.degraded:
        payload["error"] = "Open-Meteo indisponible"
    return payload


def sample_viewport(
    south: float,
    west: float,
    north: float,
    east: float,
    *,
    provider: FetchProvider | None = None,
    now: datetime | None = None,
) -> dict:
    """Échantillonne Open-Meteo pour l'emprise visible, via un cache mémoire.

    `provider` permet d'injecter un fournisseur de test (aucun réseau) et `now`
    de figer l'horloge, afin que les cumuls sur 24 h restent déterministes.
    """
    validate_bbox(south, west, north, east)
    sampling = _select_sampling(south, west, north, east)
    sample = _cache_get(sampling.cache_key)
    if sample is None:
        sample = _sample(sampling, provider, now or datetime.now(timezone.utc), thresholds())
        _cache_set(sampling.cache_key, sample)
    return _payload(south, west, north, east, sample)
