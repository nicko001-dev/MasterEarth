"""Proxy du radar de précipitations mondial RainViewer.

Le globe charge des tuiles radar animées. Le navigateur ne peut pas les
demander directement à RainViewer : les réponses du fournisseur ne portent pas
d'en-tête CORS fiable, et un accès direct exposerait aussi son quota. Ce module
récupère la liste des images, valide strictement son contenu, la met en cache
et sert les tuiles PNG depuis notre propre origine.

Aucune URL n'est construite à partir d'une valeur arbitraire du fournisseur :
l'hôte est imposé et le chemin doit correspondre au gabarit RainViewer
(``/v2/radar/<identifiant>``), ce qui évite toute requête sortante détournée.
"""

import json
import logging
import re
import threading
import time
import urllib.request
from collections import OrderedDict, defaultdict, deque
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone

log = logging.getLogger(__name__)

FRAMES_URL = "https://api.rainviewer.com/public/weather-maps.json"
UPSTREAM_HOST = "https://tilecache.rainviewer.com"
ATTRIBUTION = "Weather data by RainViewer"
ATTRIBUTION_URL = "https://www.rainviewer.com/"

FRAMES_CACHE_TTL_SECONDS = 300
TILE_CACHE_TTL_SECONDS = 600
TILE_CACHE_MAX_ENTRIES = 256
REQUEST_TIMEOUT_SECONDS = 10
MAX_TILE_BYTES = 512 * 1024
MAX_TILE_ZOOM = 7
MAX_PAST_FRAMES = 13
MAX_NOWCAST_FRAMES = 3
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 600

_FRAME_PATH = re.compile(r"^/v2/radar/[A-Za-z0-9_]+$")
_USER_AGENT = "MasterEarth/1.0"
_MAX_TRACKED_CLIENTS = 10_000
_PNG_CONTENT_TYPE = "image/png"

LIMITATIONS = (
    "Ces images sont des échos radar de précipitations, pas des mesures de "
    "débit ni de hauteur d'eau.",
    "La couverture dépend des réseaux radar nationaux : certaines zones, "
    "surtout les océans, restent sans image.",
    "Les images proviennent d'un cache de quelques minutes : ce n'est pas un "
    "flux temps réel garanti.",
    "Les images de prévision (nowcast) sont des extrapolations, pas des "
    "observations.",
)


class RadarUnavailable(Exception):
    """Le fournisseur radar est injoignable ou sa réponse est inexploitable."""


@dataclass(frozen=True)
class RadarFrame:
    """Une image radar datée, telle que servie par le fournisseur."""

    time: int
    path: str
    forecast: bool


@dataclass(frozen=True)
class RadarProduct:
    """Liste validée des images radar, avec l'hôte de tuiles imposé."""

    host: str
    frames: tuple[RadarFrame, ...]
    fetched_at: float


Fetcher = Callable[[], object]
Clock = Callable[[], float]


def _parse_frame(raw: object, *, forecast: bool) -> RadarFrame | None:
    """Valide une image du fournisseur ; toute entrée douteuse est ignorée."""
    if not isinstance(raw, dict):
        return None
    path = raw.get("path")
    timestamp = raw.get("time")
    if not isinstance(path, str) or _FRAME_PATH.fullmatch(path) is None:
        return None
    if (
        not isinstance(timestamp, int)
        or isinstance(timestamp, bool)
        or timestamp <= 0
    ):
        return None
    return RadarFrame(time=timestamp, path=path, forecast=forecast)


def _parse_frames(raw: object, *, forecast: bool) -> list[RadarFrame]:
    if not isinstance(raw, list):
        return []
    frames = []
    for item in raw:
        frame = _parse_frame(item, forecast=forecast)
        if frame is not None:
            frames.append(frame)
    return frames


def parse_product(payload: object, *, fetched_at: float) -> RadarProduct:
    """Construit un produit radar validé, ou échoue en ``ValueError``."""
    if not isinstance(payload, dict):
        raise ValueError("Réponse RainViewer invalide.")
    radar_payload = payload.get("radar")
    if not isinstance(radar_payload, dict):
        raise ValueError("Réponse RainViewer invalide.")

    past = _parse_frames(radar_payload.get("past"), forecast=False)
    nowcast = _parse_frames(radar_payload.get("nowcast"), forecast=True)
    past.sort(key=lambda frame: frame.time)
    nowcast.sort(key=lambda frame: frame.time)

    # Les images passées les plus récentes, puis les premières prévisions.
    selected = past[-MAX_PAST_FRAMES:] + nowcast[:MAX_NOWCAST_FRAMES]
    by_time: dict[int, RadarFrame] = {}
    for frame in selected:
        by_time[frame.time] = frame
    frames = tuple(sorted(by_time.values(), key=lambda frame: frame.time))
    if not frames:
        raise ValueError("Aucune image radar exploitable.")

    return RadarProduct(host=UPSTREAM_HOST, frames=frames, fetched_at=fetched_at)


def _fetch_payload() -> object:
    """Récupère la liste des images (une requête JSON, sans clé)."""
    request = urllib.request.Request(
        FRAMES_URL,
        headers={"User-Agent": _USER_AGENT, "Accept": "application/json"},
    )
    with urllib.request.urlopen(  # noqa: S310 - URL constante du fournisseur
        request, timeout=REQUEST_TIMEOUT_SECONDS
    ) as response:
        return json.load(response)


_cache: RadarProduct | None = None
_cache_lock = threading.Lock()


def load_frames(
    refresh: bool = False,
    *,
    fetcher: Fetcher | None = None,
    now: Clock | None = None,
) -> RadarProduct:
    """Renvoie les images radar validées, mises en cache 5 minutes.

    ``refresh`` force une requête. En cas d'échec, le produit en cache (même
    périmé) est servi s'il existe, sinon ``RadarUnavailable`` est levée.
    ``fetcher`` et ``now`` permettent des tests déterministes, sans réseau.
    """
    clock = now or time.time
    fetch = fetcher or _fetch_payload
    global _cache
    with _cache_lock:
        cached = _cache
    current = clock()
    if (
        not refresh
        and cached is not None
        and current - cached.fetched_at < FRAMES_CACHE_TTL_SECONDS
    ):
        return cached
    try:
        product = parse_product(fetch(), fetched_at=current)
    except Exception as exc:  # réseau, HTTP, JSON ou format inattendu
        if cached is not None:
            log.warning(
                "Radar RainViewer indisponible (%s) : cache périmé servi.",
                type(exc).__name__,
            )
            return cached
        raise RadarUnavailable("Radar indisponible pour le moment.") from exc
    with _cache_lock:
        _cache = product
    return product


def reset_cache() -> None:
    """Vide le cache des images (tests et diagnostics uniquement)."""
    global _cache
    with _cache_lock:
        _cache = None


def frames_payload(product: RadarProduct) -> dict:
    """Charge utile JSON attendue par le frontend pour la liste des images."""
    return {
        "generated_at": datetime.fromtimestamp(
            product.fetched_at, tz=timezone.utc
        ).isoformat(),
        "attribution": ATTRIBUTION,
        "attribution_url": ATTRIBUTION_URL,
        "frames": [
            {"index": index, "time": frame.time, "forecast": frame.forecast}
            for index, frame in enumerate(product.frames)
        ],
        "limitations": list(LIMITATIONS),
    }


def validate_tile_coordinates(z: int, x: int, y: int) -> None:
    """Vérifie un triplet de tuile Web Mercator, sinon ``ValueError``."""
    for value in (z, x, y):
        if not isinstance(value, int) or isinstance(value, bool):
            raise ValueError("Coordonnées de tuile invalides.")
    if not 0 <= z <= MAX_TILE_ZOOM:
        raise ValueError(
            f"Le niveau de zoom doit être compris entre 0 et {MAX_TILE_ZOOM}."
        )
    limit = 1 << z
    if not 0 <= x < limit or not 0 <= y < limit:
        raise ValueError(
            "Coordonnées de tuile hors limites pour ce niveau de zoom."
        )


def tile_url(product: RadarProduct, index: int, z: int, x: int, y: int) -> str:
    """URL RainViewer d'une tuile PNG (schéma 2, lissé, neige)."""
    if (
        not isinstance(index, int)
        or isinstance(index, bool)
        or not 0 <= index < len(product.frames)
    ):
        raise ValueError("Index d'image radar invalide.")
    frame = product.frames[index]
    return f"{product.host}{frame.path}/256/{z}/{x}/{y}/2/1_1.png"


TileKey = tuple[str, int, int, int]

_tile_cache: OrderedDict[TileKey, tuple[float, bytes, str]] = OrderedDict()
_tile_lock = threading.Lock()


def _tile_cache_get(key: TileKey) -> tuple[bytes, str] | None:
    now = time.monotonic()
    with _tile_lock:
        entry = _tile_cache.get(key)
        if entry is None:
            return None
        stored_at, data, content_type = entry
        if now - stored_at > TILE_CACHE_TTL_SECONDS:
            _tile_cache.pop(key, None)
            return None
        _tile_cache.move_to_end(key)
        return data, content_type


def _tile_cache_set(key: TileKey, data: bytes, content_type: str) -> None:
    with _tile_lock:
        _tile_cache[key] = (time.monotonic(), data, content_type)
        _tile_cache.move_to_end(key)
        while len(_tile_cache) > TILE_CACHE_MAX_ENTRIES:
            _tile_cache.popitem(last=False)


def reset_tile_cache() -> None:
    """Vide le cache des tuiles (tests et diagnostics uniquement)."""
    with _tile_lock:
        _tile_cache.clear()


def _download_tile(url: str) -> bytes:
    """Télécharge une tuile PNG et rejette tout type ou taille inattendu."""
    request = urllib.request.Request(
        url,
        headers={"User-Agent": _USER_AGENT, "Accept": _PNG_CONTENT_TYPE},
    )
    with urllib.request.urlopen(  # noqa: S310 - URL construite depuis le cache validé
        request, timeout=REQUEST_TIMEOUT_SECONDS
    ) as response:
        content_type = response.headers.get_content_type()
        if content_type != _PNG_CONTENT_TYPE:
            raise RadarUnavailable(
                "Le fournisseur radar n'a pas renvoyé une image PNG."
            )
        data = response.read(MAX_TILE_BYTES + 1)
    if len(data) > MAX_TILE_BYTES:
        raise RadarUnavailable("La tuile radar dépasse la taille autorisée.")
    if not data:
        raise RadarUnavailable("La tuile radar est vide.")
    return data


def fetch_tile(
    product: RadarProduct, index: int, z: int, x: int, y: int
) -> tuple[bytes, str]:
    """Renvoie ``(png_bytes, content_type)`` depuis le cache ou RainViewer."""
    url = tile_url(product, index, z, x, y)
    validate_tile_coordinates(z, x, y)
    key: TileKey = (product.frames[index].path, z, x, y)
    cached = _tile_cache_get(key)
    if cached is not None:
        return cached
    try:
        data = _download_tile(url)
    except RadarUnavailable:
        raise
    except (OSError, ValueError) as exc:  # réseau, HTTP, décodage
        raise RadarUnavailable("Tuile radar indisponible pour le moment.") from exc
    _tile_cache_set(key, data, _PNG_CONTENT_TYPE)
    return data, _PNG_CONTENT_TYPE


_requests: dict[str, deque[float]] = defaultdict(deque)
_requests_lock = threading.Lock()


def allow_request(client_host: str) -> bool:
    """Au plus 600 tuiles par minute et par hôte, en mémoire du processus.

    Une animation radar légitime charge plusieurs dizaines de tuiles d'un coup
    (plusieurs images, plusieurs niveaux de zoom) : la limite protège des abus
    sans bloquer l'affichage normal.
    """
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
