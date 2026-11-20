"""Proxy du trafic aérien mondial OpenSky Network.

Le globe 3D et la carte 2D affichent des aéronefs en mouvement pour rendre la
dimension temps réel visible. Le navigateur ne contacte jamais OpenSky
directement : le serveur interroge l'API pour l'emprise visible, valide les
positions, met le résultat en cache quelques dizaines de secondes et applique
sa propre limitation de débit.

Les positions sont des observations ADS-B/MLAT datées. Entre deux observations,
le client peut prolonger le déplacement le long du cap et de la vitesse
annoncés : cette interpolation est explicitement signalée à l'utilisateur et ne
remplace jamais une observation.

Licence OpenSky : données gratuites pour un usage non commercial, attribution
obligatoire (CC BY-NC 4.0). Un déploiement commercial doit vérifier les
conditions du fournisseur ou utiliser une autre source.
"""

from __future__ import annotations

import json
import math
import threading
import time
import urllib.parse
import urllib.request
from collections import OrderedDict, defaultdict, deque
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import datetime, timezone

from app.core.exceptions import ValidationAppError

OPENSKY_URL = "https://opensky-network.org/api/states/all"
ATTRIBUTION = "OpenSky Network"
ATTRIBUTION_URL = "https://opensky-network.org/"
LICENSE = "CC BY-NC 4.0 (usage non commercial, attribution obligatoire)"

REQUEST_TIMEOUT_SECONDS = 15
CACHE_TTL_SECONDS = 45
STALE_MAX_SECONDS = 900
CACHE_MAX_ENTRIES = 48
MAX_STATES = 400
MAX_BBOX_AREA_KM2 = 30_000_000.0

# Vue mondiale : une seule requête OpenSky sans filtre d'emprise, puis un
# échantillonnage spatial pour que les avions affichés couvrent tous les
# continents au lieu d'être concentrés sur la zone la plus dense.
GLOBAL_BBOX = (-85.0, -180.0, 85.0, 180.0)
MAX_GLOBAL_STATES = 600
GLOBAL_CELL_DEG = 6.0
GLOBAL_MAX_PER_CELL = 3
GLOBAL_CACHE_TTL_SECONDS = 45
MIN_LATITUDE = -90.0
MAX_LATITUDE = 90.0
MIN_LONGITUDE = -180.0
MAX_LONGITUDE = 180.0
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 60
MAX_TRACKED_CLIENTS = 10_000

_EARTH_RADIUS_KM = 6371.0088
_USER_AGENT = "MasterEarth/1.0 (trafic aérien; contact opérateur)"
_POSITION_SOURCES = {0: "ADS-B", 1: "ASTERIX", 2: "MLAT", 3: "FLARM"}

LIMITATIONS = (
    "Positions ADS-B/MLAT datées, dépendantes de la couverture des récepteurs "
    "au sol : les zones océaniques et certains pays peuvent être absents.",
    "OpenSky est gratuit pour un usage non commercial (CC BY-NC 4.0) ; "
    "vérifiez les conditions avant tout déploiement commercial.",
    "Entre deux observations, la position affichée est prolongée le long du "
    "cap et de la vitesse : c'est une interpolation, pas une nouvelle mesure.",
    "Cette couche ne représente ni un trafic routier ni des véhicules au sol.",
    "Cache serveur de quelques dizaines de secondes : ce n'est pas un flux "
    "temps réel garanti.",
)


class AircraftUnavailable(Exception):
    """OpenSky est injoignable ou sa réponse est inexploitable."""


@dataclass(frozen=True)
class AircraftState:
    """Un aéronef observé, avec sa position et son vecteur de déplacement."""

    icao24: str
    callsign: str
    country: str
    lat: float
    lon: float
    altitude_m: float | None
    on_ground: bool
    velocity_m_s: float | None
    heading_deg: float | None
    vertical_rate_m_s: float | None
    observed_at: int | None
    source: str


@dataclass(frozen=True)
class AircraftSnapshot:
    """Résultat validé et borné pour une emprise donnée."""

    bbox: tuple[float, float, float, float]
    states: tuple[AircraftState, ...]
    fetched_at: float
    upstream_time: int | None
    degraded: bool = False


def bbox_area_km2(south: float, west: float, north: float, east: float) -> float:
    """Aire approchée de l'emprise sur une sphère, en km²."""
    latitudes = math.sin(math.radians(north)) - math.sin(math.radians(south))
    return abs(_EARTH_RADIUS_KM**2 * latitudes * math.radians(east - west))


def validate_bbox(south: float, west: float, north: float, east: float) -> None:
    """Vérifie l'emprise demandée ; échoue en 422 avec un message français."""
    for name, value, low, high in (
        ("latitude", south, MIN_LATITUDE, MAX_LATITUDE),
        ("latitude", north, MIN_LATITUDE, MAX_LATITUDE),
        ("longitude", west, MIN_LONGITUDE, MAX_LONGITUDE),
        ("longitude", east, MIN_LONGITUDE, MAX_LONGITUDE),
    ):
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            raise ValidationAppError("Coordonnées d'emprise invalides.")
        if not math.isfinite(value) or not low <= value <= high:
            raise ValidationAppError(
                f"La {name} doit être comprise entre {low:g} et {high:g} degrés."
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
    if bbox_area_km2(south, west, north, east) > MAX_BBOX_AREA_KM2:
        raise ValidationAppError(
            "L'emprise demandée est trop grande : zoomez pour afficher le "
            "trafic aérien."
        )


def _number(value: object) -> float | None:
    """Convertit un nombre JSON en float fini, en rejetant les booléens."""
    if isinstance(value, bool) or value is None:
        return None
    if not isinstance(value, (int, float)):
        return None
    number = float(value)
    return number if math.isfinite(number) else None


def _text(value: object, limit: int = 80) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def _inside(lat: float, lon: float, bbox: tuple[float, float, float, float]) -> bool:
    south, west, north, east = bbox
    return south <= lat <= north and west <= lon <= east


def distribute_states(states: list[AircraftState], limit: int) -> list[AircraftState]:
    """Répartit les observations sur des secteurs lat/lon pour couvrir le monde.

    Sans cette étape, tronquer les 12 000 états d'OpenSky par simple tri
    chronologique sur-représenterait les zones densément couvertes. On garde
    quelques appareils par secteur, en round-robin déterministe.
    """
    cells: dict[tuple[int, int], list[AircraftState]] = defaultdict(list)
    for state in states:
        key = (
            math.floor(state.lat / GLOBAL_CELL_DEG),
            math.floor(state.lon / GLOBAL_CELL_DEG),
        )
        cells[key].append(state)
    keys = sorted(cells)
    selected: list[AircraftState] = []
    for round_index in range(GLOBAL_MAX_PER_CELL):
        for key in keys:
            bucket = cells[key]
            if round_index >= len(bucket):
                continue
            selected.append(bucket[round_index])
            if len(selected) >= limit:
                return selected
    return selected[:limit]


def parse_states(
    payload: object,
    *,
    bbox: tuple[float, float, float, float],
    fetched_at: float,
    limit: int = MAX_STATES,
    distribute: bool = False,
) -> AircraftSnapshot:
    """Valide une réponse OpenSky, filtre l'emprise et borne le nombre d'états."""
    if not isinstance(payload, dict):
        raise ValueError("Réponse OpenSky invalide.")
    raw_states = payload.get("states")
    if raw_states is None:
        raw_states = []
    if not isinstance(raw_states, list):
        raise ValueError("Réponse OpenSky invalide.")

    states: list[AircraftState] = []
    for row in raw_states:
        if not isinstance(row, list) or len(row) < 17:
            continue
        icao24 = _text(row[0], 16).lower()
        if not icao24:
            continue
        lat = _number(row[6])
        lon = _number(row[5])
        if lat is None or lon is None or not _inside(lat, lon, bbox):
            continue
        altitude = _number(row[7])
        if altitude is None:
            altitude = _number(row[13])
        observed_at = row[3] if isinstance(row[3], int) and not isinstance(row[3], bool) else None
        if observed_at is None:
            observed_at = row[4] if isinstance(row[4], int) and not isinstance(row[4], bool) else None
        source_index = row[16] if isinstance(row[16], int) and not isinstance(row[16], bool) else None
        states.append(
            AircraftState(
                icao24=icao24,
                callsign=_text(row[1], 24),
                country=_text(row[2], 80),
                lat=lat,
                lon=lon,
                altitude_m=altitude,
                on_ground=row[8] is True,
                velocity_m_s=_number(row[9]),
                heading_deg=_number(row[10]),
                vertical_rate_m_s=_number(row[11]),
                observed_at=observed_at,
                source=_POSITION_SOURCES.get(source_index, "inconnue"),
            )
        )

    # Les observations les plus récentes d'abord ; l'ordre reste stable à
    # observation égale pour éviter que les avions « sautent » d'un rafraîchissement
    # à l'autre quand la limite est atteinte.
    states.sort(key=lambda state: (-(state.observed_at or 0), state.icao24))
    upstream_time = payload.get("time")
    if not isinstance(upstream_time, int) or isinstance(upstream_time, bool):
        upstream_time = None
    kept = distribute_states(states, limit) if distribute else states[:limit]
    return AircraftSnapshot(
        bbox=bbox,
        states=tuple(kept),
        fetched_at=fetched_at,
        upstream_time=upstream_time,
    )


def _fetch_payload(south: float, west: float, north: float, east: float) -> object:
    """Interroge OpenSky pour une emprise (une requête JSON, sans clé)."""
    query = urllib.parse.urlencode(
        {
            "lamin": round(south, 4),
            "lomin": round(west, 4),
            "lamax": round(north, 4),
            "lomax": round(east, 4),
        }
    )
    request = urllib.request.Request(
        f"{OPENSKY_URL}?{query}",
        headers={"User-Agent": _USER_AGENT, "Accept": "application/json"},
    )
    with urllib.request.urlopen(  # noqa: S310 - URL constante du fournisseur
        request, timeout=REQUEST_TIMEOUT_SECONDS
    ) as response:
        return json.load(response)


Fetcher = Callable[[float, float, float, float], object]
Clock = Callable[[], float]

_cache: OrderedDict[tuple[float, float, float, float], AircraftSnapshot] = OrderedDict()
_cache_lock = threading.Lock()


def _cache_key(south: float, west: float, north: float, east: float) -> tuple[float, float, float, float]:
    return (
        round(south, 1),
        round(west, 1),
        round(north, 1),
        round(east, 1),
    )


def load_snapshot(
    south: float,
    west: float,
    north: float,
    east: float,
    *,
    refresh: bool = False,
    fetcher: Fetcher | None = None,
    now: Clock | None = None,
) -> AircraftSnapshot:
    """Renvoie les aéronefs de l'emprise, avec cache et repli sur données périmées.

    ``fetcher`` et ``now`` permettent des tests déterministes, sans réseau.
    """
    validate_bbox(south, west, north, east)
    clock = now or time.time
    fetch = fetcher or _fetch_payload
    key = _cache_key(south, west, north, east)
    current = clock()
    with _cache_lock:
        cached = _cache.get(key)
        if cached is not None:
            _cache.move_to_end(key)
    if (
        not refresh
        and cached is not None
        and current - cached.fetched_at < CACHE_TTL_SECONDS
    ):
        return cached

    try:
        snapshot = parse_states(
            fetch(south, west, north, east),
            bbox=key,
            fetched_at=current,
        )
    except Exception as exc:  # réseau, HTTP, JSON ou format inattendu
        if cached is not None and current - cached.fetched_at <= STALE_MAX_SECONDS:
            return replace(cached, degraded=True)
        raise AircraftUnavailable("Trafic aérien indisponible pour le moment.") from exc

    with _cache_lock:
        _cache[key] = snapshot
        _cache.move_to_end(key)
        while len(_cache) > CACHE_MAX_ENTRIES:
            _cache.popitem(last=False)
    return snapshot


def reset_cache() -> None:
    """Vide le cache des positions (tests et diagnostics uniquement)."""
    with _cache_lock:
        _cache.clear()


GlobalFetcher = Callable[[], object]

_global_cache: AircraftSnapshot | None = None
_global_cache_lock = threading.Lock()


def load_global_snapshot(
    *,
    refresh: bool = False,
    fetcher: GlobalFetcher | None = None,
    now: Clock | None = None,
) -> AircraftSnapshot:
    """Observations ADS-B sur toute la planète, avec répartition spatiale.

    Une seule requête OpenSky (vérifiée : ~12 000 états en ~1,5 s) alimente
    la vue mondiale. Le cache est distinct du cache par emprise, pour ne pas
    mélanger une vue locale et la vue globale. En cas de panne, les positions
    déjà reçues restent servies et signalées comme périmées.
    """
    global _global_cache
    clock = now or time.time
    fetch = fetcher or (lambda: _fetch_payload(*GLOBAL_BBOX))
    current = clock()
    with _global_cache_lock:
        cached = _global_cache
    if (
        not refresh
        and cached is not None
        and current - cached.fetched_at < GLOBAL_CACHE_TTL_SECONDS
    ):
        return cached

    try:
        snapshot = parse_states(
            fetch(),
            bbox=GLOBAL_BBOX,
            fetched_at=current,
            limit=MAX_GLOBAL_STATES,
            distribute=True,
        )
    except Exception as exc:  # réseau, HTTP, JSON ou format inattendu
        if cached is not None and current - cached.fetched_at <= STALE_MAX_SECONDS:
            return replace(cached, degraded=True)
        raise AircraftUnavailable("Trafic aérien mondial indisponible pour le moment.") from exc

    with _global_cache_lock:
        _global_cache = snapshot
    return snapshot


def global_payload(snapshot: AircraftSnapshot) -> dict:
    """Charge utile de la vue mondiale, compatible avec les cartes 2D/3D."""
    body = payload(snapshot)
    body["scope"] = "worldwide"
    body["limitations"] = list(LIMITATIONS) + [
        "Vue mondiale : échantillon réparti sur tous les continents, pas la "
        "totalité des aéronefs observés.",
    ]
    return body


def reset_global_cache() -> None:
    global _global_cache
    with _global_cache_lock:
        _global_cache = None


def payload(snapshot: AircraftSnapshot) -> dict:
    """Charge utile JSON attendue par les cartes 2D et 3D."""
    south, west, north, east = snapshot.bbox
    return {
        "generated_at": datetime.fromtimestamp(
            snapshot.fetched_at, tz=timezone.utc
        ).isoformat(),
        "upstream_time": snapshot.upstream_time,
        "source": ATTRIBUTION,
        "attribution": ATTRIBUTION,
        "attribution_url": ATTRIBUTION_URL,
        "license": LICENSE,
        "degraded": snapshot.degraded,
        "bbox": {"south": south, "west": west, "north": north, "east": east},
        "count": len(snapshot.states),
        "states": [
            {
                "icao24": state.icao24,
                "callsign": state.callsign,
                "country": state.country,
                "lat": state.lat,
                "lon": state.lon,
                "altitude_m": state.altitude_m,
                "on_ground": state.on_ground,
                "velocity_m_s": state.velocity_m_s,
                "heading_deg": state.heading_deg,
                "vertical_rate_m_s": state.vertical_rate_m_s,
                "observed_at": state.observed_at,
                "source": state.source,
            }
            for state in snapshot.states
        ],
        "limitations": list(LIMITATIONS),
    }


_requests: dict[str, deque[float]] = defaultdict(deque)
_requests_lock = threading.Lock()


def allow_request(client_host: str) -> bool:
    """Au plus 60 requêtes par minute et par hôte, en mémoire du processus."""
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
