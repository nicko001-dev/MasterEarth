"""Scan mondial des précipitations courantes (Open-Meteo, CC BY 4.0).

Le réseau de capteurs déployé et les sondages de l'emprise visible ne couvrent
qu'un petit nombre de points. Afficher « 0 point en pluie » à partir de cet
échantillon laisserait croire qu'il ne pleut nulle part, ce qui est faux.

Ce service couvre toute la planète en deux passes :

1. un balayage mondial de points de sondage, en une passe groupée côté
   Open-Meteo (précipitation **courante** uniquement, avec repli sur un second
   hôte au quota distinct si le premier renvoie 429) ;
2. un **affinage local** autour des zones où il pleut : de nouveaux points très
   rapprochés sont interrogés pour localiser le maximum, puis géocodés chez
   Photon / OpenStreetMap afin d'afficher le nom de la rue, du quartier ou de
   la localité dans les statistiques.

Aucune trame de fond ni découpage en cellules n'est produit : seuls des points
nommés, des icônes et le radar réel sont rendus. Le service n'invente aucune
valeur : un point en échec reste un point **inconnu**, jamais un point sec, et
un point trop éloigné de tout lieu OSM reste anonyme avec ses coordonnées plutôt
qu'un nom trompeur.
La réponse expose donc ``valid_points``, ``failed_points`` et ``available`` pour
que l'interface affiche « données indisponibles » plutôt qu'un zéro trompeur.
Si les deux hôtes échouent, le dernier scan valide reste servi, marqué ``stale``
avec son âge exact.

Aucune écriture en base : c'est un diagnostic à la demande, mis en cache.
"""

from __future__ import annotations

import math
import threading
import time
from collections import defaultdict, deque
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone

from app.infrastructure.weather import open_meteo
from app.infrastructure.weather.open_meteo import FetchResult
from app.services import geocoding

ATTRIBUTION = "Open-Meteo (CC BY 4.0)"
ATTRIBUTION_URL = "https://open-meteo.com/"
LICENSE = "CC BY 4.0"

# Répartition régulière de points isolés : 11 latitudes x 18 longitudes = 198
# points, soit deux requêtes groupées au maximum (Open-Meteo accepte 100 lieux
# par requête). Ce ne sont que des sondages, sans aucune cellule ni ligne.
LATITUDES: tuple[float, ...] = tuple(float(v) for v in range(-75, 76, 15))
LONGITUDES: tuple[float, ...] = tuple(float(v) for v in range(-180, 180, 20))
# En dessous de ce seuil, les valeurs Open-Meteo sont arrondies à 0 : on ne
# compte pas un « crachin » indiscernable d'une absence de pluie.
RAIN_THRESHOLD_MM_H = 0.05
CACHE_TTL_SECONDS = 600
# Le quota quotidien Open-Meteo peut être épuisé plusieurs heures : la dernière
# mesure valide reste servie, explicitement marquée périmée avec son âge.
STALE_MAX_SECONDS = 6 * 3600
MAX_WETTEST = 5
# Affinage : jusqu'à 8 zones arrosées, 9 sondages serrés autour de chacune,
# soit 72 points supplémentaires en une seule requête groupée. Les lieux sont
# nommés en parallèle (4 au plus) pour ne pas allonger la réponse si Photon
# met plusieurs secondes à répondre sur certains continents.
MAX_REFINE_ZONES = 8
MAX_GEOCODING_WORKERS = 4
REFINE_OFFSETS_DEG = (-0.12, 0.0, 0.12)
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 30
MAX_TRACKED_CLIENTS = 10_000

LIMITATIONS = (
    "Modèle Open-Meteo, pas une mesure terrain : estimation à l'échelle de la résolution du modèle.",
    "198 points de sondage répartis sur la planète : une pluie très locale peut d'abord échapper au balayage.",
    "Jusqu'à 8 zones arrosées sont réinterrogées sur 9 points rapprochés chacune, en une seule requête groupée.",
    "Les noms de rues/quartiers viennent d'OpenStreetMap via Photon ; un point isolé reste anonyme avec ses coordonnées.",
    "Le compteur concerne les points du scan mondial, pas les capteurs déployés.",
    "Cache serveur de 10 minutes : ce n'est pas un flux temps réel garanti.",
    "Repli possible sur un second hôte Open-Meteo (quota distinct) : même modèle, même licence.",
    "Hors quota : la dernière mesure valide reste affichée, marquée périmée, jamais inventée.",
)

FetchProvider = Callable[[list[tuple[str, float, float]]], list[FetchResult]]
Geocoder = Callable[[float, float], dict | None]


class GlobalRainUnavailable(Exception):
    """Le scan mondial n'a produit aucune valeur exploitable."""


@dataclass(frozen=True)
class RainSample:
    """Un point du scan : ``precip_mm_h`` vaut None si le fournisseur a échoué."""

    name: str
    lat: float
    lon: float
    precip_mm_h: float | None


@dataclass(frozen=True)
class GlobalRainSnapshot:
    samples: tuple[RainSample, ...]
    generated_at: datetime
    degraded: bool = False
    #: dernier scan valide servi faute de donnée fraîche (avec son âge)
    stale: bool = False
    #: hôte Open-Meteo ayant répondu (provenance)
    source: str = "Open-Meteo"
    #: zones en pluie affinées localement et nommées (rue / quartier / localité)
    places: tuple[dict, ...] = ()


def scan_source() -> str:
    """Libellé de provenance du scan courant, pour la charge utile."""
    host = open_meteo.current_host()
    if not host:
        return "Open-Meteo"
    if "historical-forecast-api" in host:
        return "Open-Meteo (hôte de repli)"
    return "Open-Meteo"


def point_name(lat: float, lon: float) -> str:
    return f"Monde {lat:.0f},{lon:.0f}"


def global_points() -> list[tuple[str, float, float]]:
    """Répartition mondiale stable : la stabilité permet de réutiliser le cache."""
    return [
        (point_name(lat, lon), lat, lon)
        for lat in LATITUDES
        for lon in LONGITUDES
    ]


def current_precipitation(points: list | None, now: datetime) -> float | None:
    """Dernière valeur observée (non prévisionnelle) d'un point Open-Meteo."""
    if not points:
        return None
    observed = [
        point
        for point in points
        if not getattr(point, "is_forecast", True)
        and isinstance(getattr(point, "valid_at", None), datetime)
        and point.valid_at <= now
        and isinstance(getattr(point, "precip_mm", None), (int, float))
    ]
    if not observed:
        return None
    latest = max(observed, key=lambda point: point.valid_at)
    value = float(latest.precip_mm)
    return value if 0 <= value <= 500 else None


def parse_results(
    results: list[FetchResult],
    *,
    now: datetime,
    expected: list[tuple[str, float, float]] | None = None,
) -> tuple[RainSample, ...]:
    """Associe chaque résultat à son point; un échec reste une valeur inconnue."""
    expected = expected if expected is not None else global_points()
    by_location = {location: result for result in results for location in [result.location]}
    samples: list[RainSample] = []
    for name, lat, lon in expected:
        result = by_location.get((name, lat, lon))
        value = current_precipitation(result.points, now) if result else None
        samples.append(RainSample(name=name, lat=lat, lon=lon, precip_mm_h=value))
    return tuple(samples)


def coordinate_label(lat: float, lon: float) -> str:
    """Libellé honnête pour un point isolé (océan, désert) sans lieu OSM proche."""
    north_south = "N" if lat >= 0 else "S"
    east_west = "E" if lon >= 0 else "O"
    return f"Zone sans nom ({abs(lat):.2f}°{north_south}, {abs(lon):.2f}°{east_west})"


def describe_place(sample: RainSample, geocoder: Geocoder | None = None) -> dict:
    """Nomme un point arrosé : rue / quartier / localité, sinon coordonnées.

    Aucun nom n'est inventé. Si Photon échoue ou si le lieu OSM est à plus de
    30 km, on affiche la zone sans nom avec ses coordonnées exactes.
    """
    lookup = geocoder or geocoding.reverse_named
    try:
        found = lookup(sample.lat, sample.lon)
    except Exception:  # géocodeur indisponible : on ne casse jamais le scan
        found = None
    # Prévention : le niveau de risque de pluie est calculé avec les mêmes
    # seuils déterministes que le reste de la plateforme, où que ce soit.
    from app.domain.weather import rain_risk
    from app.services.weather import thresholds

    try:
        risk_level = rain_risk(sample.precip_mm_h or 0, 0, thresholds())
    except Exception:
        risk_level = "green"
    place = found.get("place") if isinstance(found, dict) else None
    distance = found.get("distance_km") if isinstance(found, dict) else None
    base = {
        "lat": round(sample.lat, 4),
        "lon": round(sample.lon, 4),
        "precip_mm_h": round(sample.precip_mm_h or 0, 2),
        "risk_level": risk_level,
        "attribution": geocoding.ATTRIBUTION,
    }
    if not isinstance(place, dict) or not isinstance(place.get("name"), str):
        return {
            **base,
            "name": coordinate_label(sample.lat, sample.lon),
            "detail": "Aucun lieu nommé à proximité",
            "street": None,
            "city": None,
            "country": None,
            "precision": "coordinates",
            "distance_km": None,
            "named": False,
        }

    street = place.get("street")
    house = place.get("housenumber")
    street_label = None
    if isinstance(street, str) and street.strip():
        street_label = f"{house} {street.strip()}".strip() if house else street.strip()
    place_name = place["name"].strip()
    name = street_label or place_name
    locality = place.get("suburb") or place.get("district") or place.get("city")
    country = place.get("country")
    details: list[str] = []
    for candidate in (
        place_name if street_label and place_name != street_label else None,
        locality if isinstance(locality, str) and locality != name else None,
        place.get("state") if not locality else None,
        country,
    ):
        if isinstance(candidate, str) and candidate.strip() and candidate not in details:
            details.append(candidate.strip())
    precision = (
        "street" if street_label
        else "district" if place.get("type") == "district"
        else "locality"
    )
    return {
        **base,
        "name": name,
        "detail": ", ".join(details),
        "street": street_label,
        "city": locality if isinstance(locality, str) else place.get("city"),
        "country": country,
        "precision": precision,
        "distance_km": distance,
        "named": True,
    }


def refine_candidates(samples: tuple[RainSample, ...]) -> list[RainSample]:
    """Zones arrosées les plus intenses, espacées pour couvrir plusieurs régions."""
    wet = [
        sample for sample in samples
        if sample.precip_mm_h is not None and sample.precip_mm_h > RAIN_THRESHOLD_MM_H
    ]
    wet.sort(key=lambda sample: sample.precip_mm_h or 0, reverse=True)
    selected: list[RainSample] = []
    for sample in wet:
        if all(
            abs(sample.lat - other.lat) > 5 or abs(sample.lon - other.lon) > 10
            for other in selected
        ):
            selected.append(sample)
        if len(selected) >= MAX_REFINE_ZONES:
            break
    return selected


def refine_points(zones: list[RainSample]) -> list[tuple[str, float, float]]:
    """Sondages serrés (≈ 13 km) autour de chaque zone en pluie."""
    points: list[tuple[str, float, float]] = []
    for zone in zones:
        longitude_scale = 1 / max(0.2, math.cos(math.radians(zone.lat)))
        for lat_offset in REFINE_OFFSETS_DEG:
            for lon_offset in REFINE_OFFSETS_DEG:
                lat = round(max(-89.9, min(89.9, zone.lat + lat_offset)), 4)
                lon = round(((zone.lon + lon_offset * longitude_scale + 180) % 360) - 180, 4)
                points.append((f"Affinage {zone.name} {lat},{lon}", lat, lon))
    return points


def describe_places(peaks: list[RainSample], geocoder: Geocoder | None = None) -> tuple[dict, ...]:
    """Nomme les zones en parallèle, en conservant strictement leur ordre.

    Photon peut mettre jusqu'à 6 secondes à répondre depuis certains continents ;
    un appel séquentiel ferait attendre le navigateur 8 x 6 s. Quatre workers
    suffisent à rester courtois envers le service public tout en gardant une
    réponse rapide. Chaque appel est déjà protégé contre les exceptions.
    """
    if not peaks:
        return ()
    lookup = geocoder or geocoding.reverse_named
    workers = min(MAX_GEOCODING_WORKERS, len(peaks))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(describe_place, peak, lookup) for peak in peaks]
        return tuple(future.result() for future in futures)


def refine_wet_zones(
    zones: list[RainSample],
    provider: FetchProvider,
    now: datetime,
    geocoder: Geocoder | None = None,
) -> tuple[dict, ...]:
    """Précise le maximum de chaque zone en pluie, puis nomme le lieu.

    Une panne de l'affinage ne fait jamais échouer le scan : on garde alors le
    point du balayage mondial, géocodé tel quel.
    """
    if not zones:
        return ()
    points = refine_points(zones)
    try:
        results = provider(points)
        detailed = parse_results(results, now=now, expected=points)
    except Exception:
        detailed = ()

    per_zone = len(REFINE_OFFSETS_DEG) ** 2
    peaks: list[RainSample] = []
    for index, zone in enumerate(zones):
        local = detailed[index * per_zone:(index + 1) * per_zone] if detailed else []
        best = max(
            (sample for sample in local if sample.precip_mm_h is not None),
            key=lambda sample: sample.precip_mm_h or 0,
            default=None,
        )
        if best is None or (zone.precip_mm_h or 0) >= (best.precip_mm_h or 0):
            best = zone
        peaks.append(best)
    return describe_places(peaks, geocoder)


_cache: dict[str, GlobalRainSnapshot] = {}
_cache_lock = threading.Lock()


def scan(
    *,
    provider: FetchProvider | None = None,
    now: datetime | None = None,
    force: bool = False,
    refine: bool | None = None,
    geocoder: Geocoder | None = None,
) -> GlobalRainSnapshot:
    """Scan mondial avec cache, affinage nommé, repli périmé et test sans réseau.

    ``refine`` vaut ``True`` en production (aucun ``provider`` injecté). Les
    tests qui injectent un fournisseur restent déterministes : l'affinage est
    alors désactivé sauf demande explicite.
    """
    moment = now or datetime.now(timezone.utc)
    with _cache_lock:
        cached = _cache.get("world")
    if (
        not force
        and cached is not None
        and (moment - cached.generated_at).total_seconds() < CACHE_TTL_SECONDS
    ):
        return cached

    fetch = provider or open_meteo.fetch_current_many
    expected = global_points()
    results = fetch(list(expected))
    samples = parse_results(results, now=moment, expected=expected)
    valid = sum(1 for sample in samples if sample.precip_mm_h is not None)

    if valid == 0:
        if cached is not None and (moment - cached.generated_at).total_seconds() <= STALE_MAX_SECONDS:
            return GlobalRainSnapshot(
                samples=cached.samples,
                generated_at=cached.generated_at,
                degraded=True,
                stale=True,
                source=cached.source,
                places=cached.places,
            )
        raise GlobalRainUnavailable("Scan de pluie mondial indisponible pour le moment.")

    should_refine = refine if refine is not None else provider is None
    places = (
        refine_wet_zones(refine_candidates(samples), fetch, moment, geocoder=geocoder)
        if should_refine else ()
    )
    snapshot = GlobalRainSnapshot(
        samples=samples,
        generated_at=moment,
        degraded=valid < len(samples),
        source=scan_source() if provider is None else "Open-Meteo",
        places=places,
    )
    with _cache_lock:
        _cache["world"] = snapshot
    return snapshot


def payload(snapshot: GlobalRainSnapshot, *, now: datetime | None = None) -> dict:
    """Charge utile : le zéro n'est jamais confondu avec une donnée manquante."""
    moment = now or datetime.now(timezone.utc)
    age_seconds = max(0, int((moment - snapshot.generated_at).total_seconds()))
    valid = [sample for sample in snapshot.samples if sample.precip_mm_h is not None]
    wet = [sample for sample in valid if (sample.precip_mm_h or 0) > RAIN_THRESHOLD_MM_H]
    wettest = sorted(valid, key=lambda sample: sample.precip_mm_h or 0, reverse=True)[:MAX_WETTEST]
    available = bool(valid)
    return {
        "generated_at": snapshot.generated_at.isoformat(),
        "scope": "worldwide",
        "available": available,
        "stale": snapshot.stale,
        "age_seconds": age_seconds,
        "source": snapshot.source,
        "sampled_points": len(snapshot.samples),
        "valid_points": len(valid),
        "failed_points": len(snapshot.samples) - len(valid),
        "rain_points": len(wet) if available else None,
        "rain_fraction": round(len(wet) / len(valid), 4) if available else None,
        "max_precip_mm_h": round(max((s.precip_mm_h or 0) for s in valid), 2) if available else None,
        "wettest": [
            {
                "name": sample.name,
                "lat": sample.lat,
                "lon": sample.lon,
                "precip_mm_h": round(sample.precip_mm_h or 0, 2),
            }
            for sample in wettest
        ],
        "rain_places": [dict(place) for place in snapshot.places],
        "degraded": snapshot.degraded,
        "attribution": ATTRIBUTION,
        "attribution_url": ATTRIBUTION_URL,
        "license": LICENSE,
        "limitations": list(LIMITATIONS),
    }


def unavailable_payload() -> dict:
    """Réponse explicite quand aucune valeur n'est exploitable.

    ``rain_points`` reste ``None`` : l'interface doit afficher « indisponible »,
    surtout pas un zéro qui serait lu comme « il ne pleut nulle part ».
    """
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "worldwide",
        "available": False,
        "stale": True,
        "age_seconds": 0,
        "source": None,
        "sampled_points": len(global_points()),
        "valid_points": 0,
        "failed_points": len(global_points()),
        "rain_points": None,
        "rain_fraction": None,
        "max_precip_mm_h": None,
        "wettest": [],
        "rain_places": [],
        "degraded": True,
        "attribution": ATTRIBUTION,
        "attribution_url": ATTRIBUTION_URL,
        "license": LICENSE,
        "limitations": list(LIMITATIONS),
    }


def reset_cache() -> None:
    with _cache_lock:
        _cache.clear()


_requests: dict[str, deque[float]] = defaultdict(deque)
_requests_lock = threading.Lock()


def allow_request(client_host: str) -> bool:
    now = time.monotonic()
    with _requests_lock:
        recent = _requests[client_host]
        while recent and now - recent[0] >= RATE_LIMIT_WINDOW_SECONDS:
            recent.popleft()
        if len(recent) >= RATE_LIMIT_MAX_REQUESTS:
            return False
        recent.append(now)
        if len(_requests) > MAX_TRACKED_CLIENTS:
            for stale_host in [
                host
                for host, stamps in _requests.items()
                if not stamps or now - stamps[-1] >= RATE_LIMIT_WINDOW_SECONDS
            ]:
                _requests.pop(stale_host, None)
        return True


def reset_rate_limit() -> None:
    with _requests_lock:
        _requests.clear()
