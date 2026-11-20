"""Réseau routier OpenStreetMap pour l'animation du trafic au sol.

Le globe 3D et la carte 2D animent des véhicules (voitures, motos, camions,
bus) le long des rues réelles. Le navigateur ne contacte jamais Overpass : le
serveur interroge l'API OpenStreetMap pour l'emprise visible, normalise la
géométrie, met le résultat en cache et applique sa propre limitation de débit.

Ce que la plateforme affiche et ce qu'elle n'affiche pas :

* la **géométrie** des rues provient d'OpenStreetMap (données réelles, ©
  contributeurs OpenStreetMap, ODbL) ;
* le **mouvement** des véhicules est un modèle déterministe (vitesse par classe
  de voie, espacement, sens de circulation). Ce ne sont pas des observations :
  aucun flux mondial de véhicules routiers en direct n'est disponible sans clé
  ni conditions restrictives, et MasterEarth n'en invente pas.

Le client reçoit donc des routes, pas des véhicules : il calcule les positions
à partir de l'heure courante, ce qui garantit un déplacement continu même sans
nouvelle requête réseau.
"""

from __future__ import annotations

import json
import math
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import OrderedDict, defaultdict, deque
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import datetime, timezone

from app.core.exceptions import ValidationAppError

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
#: Miroirs interrogés en cascade : le service public principal est souvent
#: saturé (HTTP 502/504) ou lent à certaines heures.
OVERPASS_MIRRORS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)
ATTRIBUTION = "© contributeurs OpenStreetMap"
ATTRIBUTION_URL = "https://www.openstreetmap.org/copyright"
LICENSE = "ODbL 1.0 (attribution et partage à l'identique)"

REQUEST_TIMEOUT_SECONDS = 60
CACHE_TTL_SECONDS = 1_800
STALE_MAX_SECONDS = 86_400
CACHE_MAX_ENTRIES = 24
MAX_WAYS = 420
MAX_POINTS_PER_WAY = 48
MAX_BBOX_AREA_KM2 = 2_500.0
OVERLAP_REUSE_RATIO = 0.55
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 30
MAX_TRACKED_CLIENTS = 10_000

#: Classes de voies demandées, de la plus rapide à la plus locale.
ROAD_CLASSES = (
    "motorway",
    "trunk",
    "primary",
    "secondary",
    "tertiary",
    "residential",
    "unclassified",
    "living_street",
)

_EARTH_RADIUS_KM = 6371.0088
_USER_AGENT = "MasterEarth/1.0 (réseau routier; contact opérateur)"

LIMITATIONS = (
    "La géométrie des rues provient d'OpenStreetMap (ODbL) : les tracés "
    "récents peuvent manquer et certains quartiers sont incomplets.",
    "Le déplacement des véhicules est un modèle (vitesse par classe de voie, "
    "sens de circulation) : ce ne sont pas des observations de trafic.",
    "Aucun feu, embouteillage ou incident réel n'est représenté.",
    "Le réseau routier n'est chargé qu'en vue locale, pour rester sous le "
    "quota du fournisseur et garder une réponse utile.",
    "Cache serveur de trente minutes : le tracé ne suit pas les travaux en cours.",
)


class RoadsUnavailable(Exception):
    """Overpass est injoignable ou sa réponse est inexploitable."""


@dataclass(frozen=True)
class Road:
    """Une voie normalisée, prête à porter un flux de véhicules."""

    id: str
    road_class: str
    oneway: int
    max_speed_kmh: int | None
    points: tuple[tuple[float, float], ...]


@dataclass(frozen=True)
class RoadsSnapshot:
    """Résultat validé et borné pour une emprise donnée."""

    bbox: tuple[float, float, float, float]
    roads: tuple[Road, ...]
    fetched_at: float
    degraded: bool = False


def bbox_area_km2(south: float, west: float, north: float, east: float) -> float:
    """Aire approchée de l'emprise sur une sphère, en km²."""
    latitudes = math.sin(math.radians(north)) - math.sin(math.radians(south))
    return abs(_EARTH_RADIUS_KM**2 * latitudes * math.radians(east - west))


def validate_bbox(south: float, west: float, north: float, east: float) -> None:
    """Vérifie l'emprise demandée ; échoue en 422 avec un message français."""
    for name, value, low, high in (
        ("latitude", south, -90.0, 90.0),
        ("latitude", north, -90.0, 90.0),
        ("longitude", west, -180.0, 180.0),
        ("longitude", east, -180.0, 180.0),
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
            "L'emprise demandée est trop grande pour le réseau routier : "
            "zoomez jusqu'à une vue de ville."
        )


def _speed_from_tags(tags: dict, road_class: str) -> int | None:
    """Vitesse maximale déclarée, bornée à une plage plausible."""
    raw = tags.get("maxspeed")
    if isinstance(raw, str):
        digits = "".join(character for character in raw if character.isdigit())
        if digits:
            value = int(digits)
            if 5 <= value <= 160:
                return value
    defaults = {
        "motorway": 110,
        "trunk": 90,
        "primary": 70,
        "secondary": 60,
        "tertiary": 50,
        "residential": 30,
        "unclassified": 40,
        "living_street": 20,
    }
    return defaults.get(road_class)


def _oneway(tags: dict) -> int:
    value = tags.get("oneway")
    if value in ("yes", "true", "1") or tags.get("junction") == "roundabout":
        return 1
    if value == "-1":
        return -1
    if tags.get("highway") == "motorway":
        return 1
    return 0


def _decimate(points: list[tuple[float, float]], limit: int = MAX_POINTS_PER_WAY) -> tuple[tuple[float, float], ...]:
    """Réduit une polyligne en conservant ses extrémités et sa forme."""
    if len(points) <= limit:
        return tuple(points)
    step = (len(points) - 1) / (limit - 1)
    kept = [points[round(index * step)] for index in range(limit)]
    kept[-1] = points[-1]
    return tuple(kept)


def parse_roads(payload: object, *, bbox: tuple[float, float, float, float], fetched_at: float) -> RoadsSnapshot:
    """Valide une réponse Overpass et normalise les voies exploitables."""
    if not isinstance(payload, dict):
        raise ValueError("Réponse Overpass invalide.")
    elements = payload.get("elements")
    if elements is None:
        elements = []
    if not isinstance(elements, list):
        raise ValueError("Réponse Overpass invalide.")

    roads: list[Road] = []
    seen: set[str] = set()
    for element in elements:
        if not isinstance(element, dict) or element.get("type") != "way":
            continue
        tags = element.get("tags")
        if not isinstance(tags, dict):
            continue
        road_class = tags.get("highway")
        if road_class not in ROAD_CLASSES:
            continue
        geometry = element.get("geometry")
        if not isinstance(geometry, list) or len(geometry) < 2:
            continue
        points: list[tuple[float, float]] = []
        for node in geometry:
            if not isinstance(node, dict):
                continue
            lat, lon = node.get("lat"), node.get("lon")
            if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
                continue
            if not (math.isfinite(lat) and math.isfinite(lon)):
                continue
            points.append((round(float(lon), 6), round(float(lat), 6)))
        if len(points) < 2:
            continue
        identifier = str(element.get("id") or f"{points[0]}-{points[-1]}")
        if identifier in seen:
            continue
        seen.add(identifier)
        roads.append(
            Road(
                id=identifier,
                road_class=road_class,
                oneway=_oneway(tags),
                max_speed_kmh=_speed_from_tags(tags, road_class),
                points=_decimate(points),
            )
        )
        if len(roads) >= MAX_WAYS:
            break

    # Les axes structurants d'abord : si le budget d'affichage manque, ce sont
    # eux qui doivent rester visibles.
    order = {name: index for index, name in enumerate(ROAD_CLASSES)}
    roads.sort(key=lambda road: (order.get(road.road_class, 99), road.id))
    return RoadsSnapshot(bbox=bbox, roads=tuple(roads), fetched_at=fetched_at)


def _build_query(south: float, west: float, north: float, east: float) -> str:
    pattern = "|".join(ROAD_CLASSES)
    return (
        "[out:json][timeout:45];"
        f'way["highway"~"^({pattern})$"]'
        f"({south:.5f},{west:.5f},{north:.5f},{east:.5f});"
        f"out tags geom {MAX_WAYS};"
    )


def _fetch_from(url: str, south: float, west: float, north: float, east: float) -> object:
    """Interroge un miroir Overpass (une requête JSON, sans clé)."""
    body = urllib.parse.urlencode({"data": _build_query(south, west, north, east)}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "User-Agent": _USER_AGENT,
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    with urllib.request.urlopen(  # noqa: S310 - URL constante du fournisseur
        request, timeout=REQUEST_TIMEOUT_SECONDS
    ) as response:
        return json.load(response)


def _fetch_payload(south: float, west: float, north: float, east: float) -> object:
    """Interroge les miroirs dans l'ordre jusqu'à obtenir une réponse exploitable."""
    last_error: Exception | None = None
    for url in OVERPASS_MIRRORS:
        try:
            payload = _fetch_from(url, south, west, north, east)
        except urllib.error.HTTPError as exc:  # 429 / 502 / 504 : miroir saturé
            last_error = RoadsUnavailable(f"Overpass a refusé la requête (HTTP {exc.code}).")
            continue
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = RoadsUnavailable("Le réseau routier est injoignable pour le moment.")
            continue
        except ValueError as exc:  # réponse non JSON
            last_error = RoadsUnavailable("La réponse d'Overpass est illisible.")
            continue
        if isinstance(payload, dict) and isinstance(payload.get("elements"), list):
            return payload
        last_error = RoadsUnavailable("La réponse d'Overpass est incomplète.")
    raise last_error or RoadsUnavailable("Le réseau routier est indisponible pour le moment.")


Fetcher = Callable[[float, float, float, float], object]
Clock = Callable[[], float]

_cache: OrderedDict[tuple[float, float, float, float], RoadsSnapshot] = OrderedDict()
_cache_lock = threading.Lock()
_fetch_lock = threading.Lock()


def _cache_key(south: float, west: float, north: float, east: float) -> tuple[float, float, float, float]:
    """Arrondit l'emprise : deux vues proches partagent la même requête."""
    return (round(south, 2), round(west, 2), round(north, 2), round(east, 2))


def _overlap_ratio(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    """Part de l'emprise `b` déjà couverte par `a` (0 = aucune)."""
    south = max(a[0], b[0])
    west = max(a[1], b[1])
    north = min(a[2], b[2])
    east = min(a[3], b[3])
    if south >= north or west >= east:
        return 0.0
    covered = bbox_area_km2(south, west, north, east)
    total = bbox_area_km2(b[0], b[1], b[2], b[3])
    return covered / total if total > 0 else 0.0


def _best_overlapping(key: tuple[float, float, float, float]) -> RoadsSnapshot | None:
    """Réutilise un voisin déjà chargé pour éviter d'attendre Overpass."""
    best: RoadsSnapshot | None = None
    best_ratio = 0.0
    for cached_key, snapshot in _cache.items():
        ratio = _overlap_ratio(cached_key, key)
        if ratio > best_ratio:
            best, best_ratio = snapshot, ratio
    return best if best is not None and best_ratio >= OVERLAP_REUSE_RATIO else None


def load_snapshot(
    south: float,
    west: float,
    north: float,
    east: float,
    *,
    refresh: bool = False,
    fetcher: Fetcher | None = None,
    now: Clock | None = None,
) -> RoadsSnapshot:
    """Renvoie le réseau routier de l'emprise, avec cache et repli périmé.

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
    if not refresh and cached is not None and current - cached.fetched_at < CACHE_TTL_SECONDS:
        return cached

    # Un voisin proche suffit : le trafic reste continu pendant que la vue bouge.
    if not refresh:
        neighbour = _best_overlapping(key)
        if neighbour is not None and current - neighbour.fetched_at < STALE_MAX_SECONDS:
            return replace(neighbour, degraded=True)

    try:
        # Une seule requête à la fois : Overpass limite les requêtes simultanées.
        with _fetch_lock:
            payload = fetch(south, west, north, east)
        snapshot = parse_roads(payload, bbox=key, fetched_at=current)
    except Exception as exc:  # réseau, HTTP, JSON ou format inattendu
        if cached is not None and current - cached.fetched_at <= STALE_MAX_SECONDS:
            return replace(cached, degraded=True)
        raise RoadsUnavailable("Le réseau routier est indisponible pour le moment.") from exc

    with _cache_lock:
        _cache[key] = snapshot
        _cache.move_to_end(key)
        while len(_cache) > CACHE_MAX_ENTRIES:
            _cache.popitem(last=False)
    return snapshot


def reset_cache() -> None:
    """Vide le cache du réseau routier (tests et diagnostics uniquement)."""
    with _cache_lock:
        _cache.clear()


_inflight: dict[tuple[float, float, float, float], threading.Thread] = {}
_inflight_lock = threading.Lock()


def snapshot_or_start(
    south: float,
    west: float,
    north: float,
    east: float,
    *,
    fetcher: Fetcher | None = None,
    now: Clock | None = None,
) -> tuple[RoadsSnapshot | None, bool]:
    """Renvoie le réseau routier, ou démarre son chargement en arrière-plan.

    Overpass met couramment vingt à quarante secondes à répondre : bloquer la
    requête HTTP du navigateur serait inutilisable et risquerait un délai
    d'expiration du proxy. La première demande renvoie donc ``(None, True)``
    (« chargement en cours ») et lance un fil ; le client réessaie quelques
    secondes plus tard et reçoit alors le résultat mis en cache.
    """
    validate_bbox(south, west, north, east)
    clock = now or time.time
    key = _cache_key(south, west, north, east)
    current = clock()

    with _cache_lock:
        cached = _cache.get(key)
    if cached is not None and current - cached.fetched_at < CACHE_TTL_SECONDS:
        return cached, False

    neighbour = _best_overlapping(key)
    if neighbour is not None and current - neighbour.fetched_at < STALE_MAX_SECONDS:
        return replace(neighbour, degraded=True), False

    with _inflight_lock:
        running = _inflight.get(key)
        if running is None or not running.is_alive():
            def run() -> None:
                try:
                    load_snapshot(
                        south,
                        west,
                        north,
                        east,
                        refresh=True,
                        fetcher=fetcher,
                        now=now,
                    )
                except RoadsUnavailable:
                    pass
                except Exception:  # noqa: BLE001 - un fil ne doit jamais propager
                    pass
                finally:
                    with _inflight_lock:
                        _inflight.pop(key, None)

            running = threading.Thread(target=run, name="roads-loader", daemon=True)
            _inflight[key] = running
            running.start()
    return None, True


def wait_for_background_loads(timeout: float = 5.0) -> None:
    """Attend la fin des chargements en cours (tests et diagnostics)."""
    with _inflight_lock:
        threads = list(_inflight.values())
    for thread in threads:
        thread.join(timeout)


def payload(snapshot: RoadsSnapshot) -> dict:
    """Charge utile JSON attendue par les cartes 2D et 3D."""
    south, west, north, east = snapshot.bbox
    return {
        "generated_at": datetime.fromtimestamp(snapshot.fetched_at, tz=timezone.utc).isoformat(),
        "source": ATTRIBUTION,
        "attribution": ATTRIBUTION,
        "attribution_url": ATTRIBUTION_URL,
        "license": LICENSE,
        "degraded": snapshot.degraded,
        "bbox": {"south": south, "west": west, "north": north, "east": east},
        "count": len(snapshot.roads),
        "roads": [
            {
                "id": road.id,
                "class": road.road_class,
                "oneway": road.oneway,
                "max_speed_kmh": road.max_speed_kmh,
                "points": [[lon, lat] for lon, lat in road.points],
            }
            for road in snapshot.roads
        ],
        "limitations": list(LIMITATIONS),
    }


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
