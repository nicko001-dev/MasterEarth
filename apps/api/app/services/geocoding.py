"""Géocodage mondial : recherche de lieux et géocodage inverse.

La plateforme n'est plus limitée à un pays : la recherche de lieux doit donc
répondre pour n'importe quelle ville, quartier ou région du monde. Le serveur
interroge Photon (géocodeur libre basé sur OpenStreetMap, auto-hébergeable), met
les réponses en cache et applique sa propre limitation de débit. Le navigateur ne
contacte jamais Photon directement.

Deux garanties importantes :

- **Repli hors ligne** : si Photon est injoignable (réseau, quota, panne), la
  recherche se rabat sur une liste locale du réseau déployé plutôt que d'échouer.
  Ce repli est signalé par ``degraded=True`` dans la réponse.
- **Provenance** : les coordonnées viennent d'OpenStreetMap via Photon (ODbL).
  Ce ne sont pas des mesures terrain et aucune donnée n'est écrite en base.

Le jeu de données embarqué côté navigateur (``/geo/places.json``, GeoNames)
reste la source utilisée par la recherche instantanée de l'interface ; ce module
sert les clients qui passent par l'API.
"""

from __future__ import annotations

import json
import math
import threading
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import OrderedDict, defaultdict, deque
from collections.abc import Callable
from dataclasses import dataclass

from app.core.exceptions import ValidationAppError

PHOTON_SEARCH_URL = "https://photon.komoot.io/api"
PHOTON_REVERSE_URL = "https://photon.komoot.io/reverse"

ATTRIBUTION = "Photon / OpenStreetMap (ODbL)"
ATTRIBUTION_URL = "https://photon.komoot.io/"
LICENSE = "ODbL 1.0 (attribution et partage à l'identique)"

REQUEST_TIMEOUT_SECONDS = 6
CACHE_TTL_SECONDS = 600
CACHE_MAX_ENTRIES = 256
MAX_RESULTS = 25
DEFAULT_LIMIT = 10
MAX_QUERY_LENGTH = 100
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 30
MAX_TRACKED_CLIENTS = 10_000
# Au-delà, le lieu OSM le plus proche est trop loin pour nommer un point météo :
# mieux vaut afficher des coordonnées qu'un nom de ville trompeur en plein océan.
MAX_REVERSE_DISTANCE_KM = 30
_KM_PER_DEGREE = 111.32

_USER_AGENT = "MasterEarth/1.0 (géocodage mondial; contact opérateur)"

LIMITATIONS = (
    "Coordonnées OpenStreetMap via Photon : points d'intérêt cartographiques, "
    "pas des mesures terrain.",
    "Le repli local ne couvre que le réseau déployé ; hors ligne, la recherche "
    "mondiale est indisponible.",
    "Cache mémoire de 10 minutes : un lieu récemment renommé peut apparaître "
    "avec son ancien nom.",
)

# Repli local : zone où le réseau de capteurs est réellement déployé. Il ne
# limite en rien la portée mondiale de la recherche, il évite seulement une
# réponse vide quand Photon est injoignable.
LOCAL_PLACES: tuple[dict, ...] = (
    {"name": "Abidjan", "lat": 5.36, "lon": -4.01, "type": "city"},
    {"name": "Yamoussoukro", "lat": 6.83, "lon": -5.28, "type": "city"},
    {"name": "Bouaké", "lat": 7.69, "lon": -5.03, "type": "city"},
    {"name": "San-Pédro", "lat": 4.75, "lon": -6.64, "type": "city"},
    {"name": "Korhogo", "lat": 9.46, "lon": -5.63, "type": "city"},
    {"name": "Daloa", "lat": 6.88, "lon": -6.45, "type": "city"},
    {"name": "Man", "lat": 7.41, "lon": -7.55, "type": "city"},
    {"name": "Cocody", "lat": 5.359, "lon": -3.985, "type": "district"},
    {"name": "Plateau", "lat": 5.32, "lon": -4.02, "type": "district"},
    {"name": "Yopougon", "lat": 5.35, "lon": -4.09, "type": "district"},
    {"name": "Abobo", "lat": 5.42, "lon": -4.02, "type": "district"},
    {"name": "Marcory", "lat": 5.29, "lon": -3.98, "type": "district"},
    {"name": "Treichville", "lat": 5.29, "lon": -4.01, "type": "district"},
    {"name": "Bingerville", "lat": 5.36, "lon": -3.89, "type": "district"},
    {"name": "Adjamé", "lat": 5.38, "lon": -4.05, "type": "district"},
    {"name": "Port-Bouët", "lat": 5.40, "lon": -4.12, "type": "district"},
    {"name": "Anyama", "lat": 5.43, "lon": -4.62, "type": "district"},
    {"name": "Dimbokro", "lat": 6.45, "lon": -5.68, "type": "city"},
    {"name": "Oumé", "lat": 6.98, "lon": -7.22, "type": "city"},
    {"name": "Agboville", "lat": 5.92, "lon": -4.22, "type": "city"},
    {"name": "Grand-Bassam", "lat": 5.21, "lon": -3.73, "type": "city"},
    {"name": "Assinie", "lat": 5.09, "lon": -3.38, "type": "city"},
    {"name": "Tiassalé", "lat": 5.90, "lon": -4.82, "type": "city"},
    {"name": "Bondoukou", "lat": 8.04, "lon": -2.80, "type": "city"},
    {"name": "Ferkessédougou", "lat": 9.58, "lon": -5.20, "type": "city"},
    {"name": "Odienné", "lat": 9.50, "lon": -7.57, "type": "city"},
    {"name": "Séguéla", "lat": 7.97, "lon": -6.67, "type": "city"},
    {"name": "Gagnoa", "lat": 6.13, "lon": -5.93, "type": "city"},
    {"name": "Divo", "lat": 5.83, "lon": -5.37, "type": "city"},
    {"name": "Soubré", "lat": 5.78, "lon": -6.59, "type": "city"},
    {"name": "Sassandra", "lat": 4.95, "lon": -6.08, "type": "city"},
    {"name": "Tabou", "lat": 4.42, "lon": -7.35, "type": "city"},
    {"name": "Duékoué", "lat": 6.73, "lon": -7.35, "type": "city"},
    {"name": "Danané", "lat": 7.35, "lon": -8.13, "type": "city"},
)


@dataclass(frozen=True)
class SearchResult:
    """Réponse de recherche, avec son état de dégradation."""

    places: tuple[dict, ...]
    degraded: bool
    source: str


Fetcher = Callable[[str], object]
Clock = Callable[[], float]


def normalize(value: str) -> str:
    """Minuscules sans diacritiques, pour comparer des noms de lieux."""
    decomposed = unicodedata.normalize("NFKD", value)
    stripped = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(stripped.casefold().split())


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance orthodromique en kilomètres."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = phi2 - phi1
    delta_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    return 2 * 6371.0088 * math.asin(math.sqrt(min(1.0, a)))


def place_type(properties: dict) -> str:
    """Classe un résultat Photon en type lisible par l'interface."""
    osm_key = str(properties.get("osm_key") or "").casefold()
    osm_value = str(properties.get("osm_value") or "").casefold()
    feature_type = str(properties.get("type") or "").casefold()
    if osm_key == "place" and osm_value in {"city", "town", "village", "hamlet", "locality"}:
        return "city"
    if osm_key == "place" and osm_value in {
        "suburb",
        "neighbourhood",
        "quarter",
        "borough",
        "district",
    }:
        return "district"
    if osm_key in {"boundary", "admin"} or feature_type in {"state", "county", "region"}:
        return "region"
    if osm_key == "place" and osm_value == "country":
        return "country"
    if feature_type == "house" or osm_key in {"highway", "building"}:
        return "address"
    return "other"


def _clean_number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    if not math.isfinite(number):
        return None
    return number


def _feature_to_place(feature: object) -> dict | None:
    """Convertit une Feature GeoJSON Photon en lieu, ou ``None`` si inutilisable."""
    if not isinstance(feature, dict):
        return None
    geometry = feature.get("geometry")
    properties = feature.get("properties")
    if not isinstance(geometry, dict) or not isinstance(properties, dict):
        return None
    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, (list, tuple)) or len(coordinates) < 2:
        return None
    longitude = _clean_number(coordinates[0])
    latitude = _clean_number(coordinates[1])
    if latitude is None or longitude is None:
        return None
    if not (-90 <= latitude <= 90) or not (-180 <= longitude <= 180):
        return None

    name = properties.get("name") or properties.get("city") or properties.get("street")
    if not isinstance(name, str) or not name.strip():
        return None

    place = {
        "name": name.strip(),
        "lat": round(latitude, 5),
        "lon": round(longitude, 5),
        "type": place_type(properties),
    }
    for key in ("country", "state", "city", "district", "suburb", "street", "housenumber", "postcode"):
        value = properties.get(key)
        if isinstance(value, str) and value.strip() and value.strip() != place["name"]:
            place[key] = value.strip()
    return place


def parse_places(payload: object, limit: int = DEFAULT_LIMIT) -> list[dict]:
    """Extrait et dédoublonne les lieux d'une réponse Photon."""
    if not isinstance(payload, dict):
        return []
    features = payload.get("features")
    if not isinstance(features, list):
        return []
    places: list[dict] = []
    seen: set[tuple[str, float, float]] = set()
    for feature in features:
        place = _feature_to_place(feature)
        if place is None:
            continue
        key = (normalize(place["name"]), place["lat"], place["lon"])
        if key in seen:
            continue
        seen.add(key)
        places.append(place)
        if len(places) >= max(1, min(limit, MAX_RESULTS)):
            break
    return places


def _fetch_search(url: str) -> object:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": _USER_AGENT, "Accept": "application/json"},
    )
    with urllib.request.urlopen(  # noqa: S310 - URL constante du fournisseur
        request, timeout=REQUEST_TIMEOUT_SECONDS
    ) as response:
        return json.load(response)


def _search_url(query: str, limit: int, language: str) -> str:
    params = urllib.parse.urlencode(
        {"q": query, "limit": max(1, min(limit, MAX_RESULTS)), "lang": language}
    )
    return f"{PHOTON_SEARCH_URL}?{params}"


def _reverse_url(latitude: float, longitude: float, language: str) -> str:
    params = urllib.parse.urlencode(
        {"lat": round(latitude, 5), "lon": round(longitude, 5), "lang": language}
    )
    return f"{PHOTON_REVERSE_URL}?{params}"


def local_search(query: str, limit: int) -> list[dict]:
    """Repli : recherche locale sur le réseau déployé, sans réseau."""
    needle = normalize(query)
    if not needle:
        return []
    matches = [dict(place) for place in LOCAL_PLACES if needle in normalize(place["name"])]
    matches.sort(
        key=lambda place: (
            0 if normalize(place["name"]) == needle else 1,
            len(place["name"]),
            place["name"],
        )
    )
    return matches[:limit]


def local_reverse(latitude: float, longitude: float) -> dict:
    """Repli : lieu local le plus proche."""
    closest = min(
        LOCAL_PLACES,
        key=lambda place: haversine_km(latitude, longitude, place["lat"], place["lon"]),
    )
    distance = haversine_km(latitude, longitude, closest["lat"], closest["lon"])
    return {"place": dict(closest), "distance_km": round(distance, 1)}


_cache: OrderedDict[tuple, tuple[float, object]] = OrderedDict()
_cache_lock = threading.Lock()


def _cache_get(key: tuple) -> object | None:
    now = time.monotonic()
    with _cache_lock:
        entry = _cache.get(key)
        if entry is None:
            return None
        stored_at, value = entry
        if now - stored_at > CACHE_TTL_SECONDS:
            _cache.pop(key, None)
            return None
        _cache.move_to_end(key)
        return value


def _cache_set(key: tuple, value: object) -> None:
    with _cache_lock:
        _cache[key] = (time.monotonic(), value)
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
    """Au plus 30 requêtes par minute et par hôte, en mémoire du processus."""
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
    """Vide le compteur anti-abus (tests et diagnostics uniquement)."""
    with _requests_lock:
        _requests.clear()


def validate_query(query: str) -> str:
    """Nettoie et valide la requête ; échoue en 422 avec un message français."""
    cleaned = " ".join((query or "").split())
    if not cleaned:
        raise ValidationAppError("La recherche doit contenir au moins un caractère.")
    if len(cleaned) > MAX_QUERY_LENGTH:
        raise ValidationAppError(
            f"La recherche est limitée à {MAX_QUERY_LENGTH} caractères."
        )
    return cleaned


def search(
    query: str,
    limit: int = DEFAULT_LIMIT,
    *,
    language: str = "fr",
    fetcher: Fetcher | None = None,
) -> SearchResult:
    """Recherche mondiale ; repli local explicite si Photon est indisponible."""
    cleaned = validate_query(query)
    bounded = max(1, min(limit, MAX_RESULTS))
    key = ("search", normalize(cleaned), bounded, language)
    cached = _cache_get(key)
    if isinstance(cached, SearchResult):
        return cached

    fetch = fetcher or _fetch_search
    try:
        places = parse_places(fetch(_search_url(cleaned, bounded, language)), bounded)
    except Exception:  # réseau, quota, format : repli, jamais d'erreur 500
        result = SearchResult(
            places=tuple(local_search(cleaned, bounded)), degraded=True, source="local"
        )
        # Le repli n'est pas mis en cache : la prochaine requête retentera Photon.
        return result

    result = SearchResult(places=tuple(places), degraded=False, source="photon")
    _cache_set(key, result)
    return result


def reverse(
    latitude: float,
    longitude: float,
    *,
    language: str = "fr",
    fetcher: Fetcher | None = None,
) -> dict:
    """Géocodage inverse mondial ; repli local si Photon est indisponible."""
    if not (-90 <= latitude <= 90) or not (-180 <= longitude <= 180):
        raise ValidationAppError("Les coordonnées sont hors du domaine valide.")
    key = ("reverse", round(latitude, 4), round(longitude, 4), language)
    cached = _cache_get(key)
    if isinstance(cached, dict):
        return cached

    fetch = fetcher or _fetch_search
    try:
        places = parse_places(fetch(_reverse_url(latitude, longitude, language)), 1)
    except Exception:
        return local_reverse(latitude, longitude)

    if not places:
        return local_reverse(latitude, longitude)
    place = places[0]
    distance = haversine_km(latitude, longitude, place["lat"], place["lon"])
    payload = {"place": place, "distance_km": round(distance, 1)}
    _cache_set(key, payload)
    return payload


def reverse_named(
    latitude: float,
    longitude: float,
    *,
    language: str = "fr",
    fetcher: Fetcher | None = None,
) -> dict | None:
    """Nomme un point météo **partout dans le monde**, sans repli trompeur.

    Contrairement à :func:`reverse`, un échec réseau ou un lieu OSM trop éloigné
    renvoie ``None`` : il ne faut jamais faire croire qu'il pleut à Abidjan alors
    que le point mesuré se trouve au milieu de l'Atlantique. Les propriétés
    ``street`` / ``district`` / ``suburb`` sont conservées pour afficher la rue
    ou le quartier dans les statistiques.
    """
    if not (-90 <= latitude <= 90) or not (-180 <= longitude <= 180):
        return None
    key = ("reverse-named", round(latitude, 4), round(longitude, 4), language)
    cached = _cache_get(key)
    if cached is not None:
        return cached if isinstance(cached, dict) else None

    fetch = fetcher or _fetch_search
    try:
        places = parse_places(fetch(_reverse_url(latitude, longitude, language)), 1)
    except Exception:
        return None
    if not places:
        return None
    place = places[0]
    distance = haversine_km(latitude, longitude, place["lat"], place["lon"])
    if distance > MAX_REVERSE_DISTANCE_KM:
        return None
    payload = {"place": place, "distance_km": round(distance, 1)}
    _cache_set(key, payload)
    return payload
