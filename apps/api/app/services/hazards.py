"""Agrégation des aléas naturels réels, à l'échelle mondiale.

MasterEarth ne fabrique aucun événement. Ce service interroge des sources
publiques officielles ou scientifiques, normalise leurs publications dans un
contrat commun, déduplique les doublons inter-sources et expose explicitement
la provenance, la licence et les échecs de chaque flux.

Sources actives :

* **USGS Earthquake Hazards** — séismes mondiaux M ≥ 2,5 sur 24 h ;
* **GDACS** (Commission européenne / JRC) — alertes multi-aléas en cours ;
* **NASA EONET** — événements naturels ouverts (feux, tempêtes, volcans…) ;
* **USGS Volcano Hazards** — volcans américains en niveau élevé ;
* **NOAA Tsunami Warning Centers** — bulletins d'alerte, de vigilance et de veille ;
* **NOAA National Hurricane Center** — cyclones tropicaux actifs dans l'Atlantique
  et le Pacifique est.

Règles de véracité :

* une source en panne n'est jamais remplacée par une valeur inventée ;
* une magnitude, une profondeur ou une population ne sont reprises que si la
  source les publie ;
* quand aucune sévérité n'est fournie, elle reste ``unknown`` au lieu d'être
  déduite arbitrairement ;
* la réponse conserve la dernière agrégation valide, marquée ``stale``, lorsque
  tous les flux échouent.
"""

from __future__ import annotations

import html
import math
import re
import threading
import time
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict, deque
from collections.abc import Callable, Mapping
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import httpx

ATTRIBUTION = "USGS · GDACS · NASA EONET · NOAA"
ATTRIBUTION_URL = "https://www.gdacs.org/"
LICENSE = "Données publiques ; consulter la licence et l'attribution de chaque source."
CACHE_TTL_SECONDS = 90
STALE_MAX_SECONDS = 6 * 3600
REQUEST_TIMEOUT_SECONDS = 18
MAX_EVENTS = 900
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_REQUESTS = 60
MAX_TRACKED_CLIENTS = 10_000

USER_AGENT = "MasterEarth/1.0 (natural-hazard monitoring; contact operator)"

USGS_EARTHQUAKES_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson"
GDACS_URL = "https://www.gdacs.org/xml/rss.xml"
EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&limit=500"
USGS_VOLCANOES_URL = "https://volcanoes.usgs.gov/hans-public/api/volcano/getCapElevated"
NOAA_TSUNAMI_FEEDS = (
    "https://www.tsunami.gov/events/xml/PAAQAtom.xml",
    "https://www.tsunami.gov/events/xml/PHEBAtom.xml",
)
NHC_STORMS_URL = "https://www.nhc.noaa.gov/CurrentStorms.json"

HAZARD_IDS = (
    "earthquake",
    "tsunami",
    "volcano",
    "hurricane",
    "flood",
    "wildfire",
    "drought",
    "landslide",
    "sandstorm",
    "blizzard",
    "heatwave",
    "tornado",
    "storm",
)

SEVERITY_ORDER = {"unknown": 0, "low": 1, "moderate": 2, "high": 3, "extreme": 4}
SEVERITY_LABEL = {
    "unknown": "Non évaluée par la source",
    "low": "Faible",
    "moderate": "Modérée",
    "high": "Élevée",
    "extreme": "Extrême",
}

SOURCE_PRIORITY = {
    "usgs_earthquakes": 0,
    "noaa_tsunami": 1,
    "usgs_volcanoes": 2,
    "nhc": 3,
    "gdacs": 4,
    "nasa_eonet": 5,
}

SOURCE_META = {
    "usgs_earthquakes": {
        "name": "USGS Earthquake Hazards",
        "url": USGS_EARTHQUAKES_URL,
        "home": "https://earthquake.usgs.gov/",
        "attribution": "USGS Earthquake Hazards Program",
        "license": "Domaine public (USGS)",
    },
    "gdacs": {
        "name": "GDACS",
        "url": GDACS_URL,
        "home": "https://www.gdacs.org/",
        "attribution": "Global Disaster Alert and Coordination System (Commission européenne / JRC)",
        "license": "Attribution GDACS requise",
    },
    "nasa_eonet": {
        "name": "NASA EONET",
        "url": EONET_URL,
        "home": "https://eonet.gsfc.nasa.gov/",
        "attribution": "NASA Earth Observatory Natural Event Tracker",
        "license": "Domaine public (NASA)",
    },
    "usgs_volcanoes": {
        "name": "USGS Volcano Hazards",
        "url": USGS_VOLCANOES_URL,
        "home": "https://volcanoes.usgs.gov/",
        "attribution": "USGS Volcano Hazards Program / observatoires",
        "license": "Domaine public (USGS)",
    },
    "noaa_tsunami": {
        "name": "NOAA Tsunami",
        "url": "https://www.tsunami.gov/",
        "home": "https://www.tsunami.gov/",
        "attribution": "NOAA / Tsunami Warning Centers",
        "license": "Domaine public (NOAA)",
    },
    "nhc": {
        "name": "NOAA NHC",
        "url": NHC_STORMS_URL,
        "home": "https://www.nhc.noaa.gov/",
        "attribution": "NOAA National Hurricane Center",
        "license": "Domaine public (NOAA)",
    },
}

LIMITATIONS = (
    "Chaque événement conserve la position, l'heure et les valeurs publiées par sa source ; aucune valeur n'est extrapolée côté serveur.",
    "Les seuils de magnitude et de fraîcheur sont ceux des flux publics : un petit séisme non ressenti peut ne pas figurer dans le flux USGS M ≥ 2,5.",
    "GDACS publie des alertes précoces : une alerte orange ou rouge signale un risque potentiel, pas une catastrophe confirmée sur le terrain.",
    "NASA EONET ne fournit pas toujours un nom de lieu ni une sévérité : la plateforme les marque comme non évalués et n'invente rien.",
    "Les catégories EONET sans équivalent dans les 13 familles (icebergs, etc.) et les feux prescrits sont écartés plutôt que rattachés à un aléa incorrect.",
    "Les flux NOAA couvrent les bassins qu'ils surveillent ; l'absence d'alerte dans un flux ne signifie pas une absence de risque mondial.",
    "Cache serveur de 90 secondes : ce n'est pas un flux temps réel garanti ; les autorités locales restent la référence.",
)

CATALOG: tuple[dict[str, Any], ...] = (
    {
        "id": "earthquake",
        "label": "Séismes",
        "label_en": "Earthquakes",
        "color": "#ff6b6b",
        "description": "Magnitude, profondeur, intensité macrosismique estimée et répliques.",
        "sources": ["usgs_earthquakes", "gdacs", "nasa_eonet"],
        "metrics": ["magnitude", "profondeur_km", "intensite_mmi", "significance"],
        "simulation_fields": [
            {"key": "magnitude", "label": "Magnitude (Mw)", "unit": "Mw", "min": 3, "max": 9.5, "step": 0.1, "default": 6.5},
            {"key": "depth_km", "label": "Profondeur", "unit": "km", "min": 1, "max": 700, "step": 1, "default": 15},
        ],
    },
    {
        "id": "tsunami",
        "label": "Tsunamis",
        "label_en": "Tsunamis",
        "color": "#26c8ff",
        "description": "Alertes océaniques, vitesse de propagation et temps d'arrivée.",
        "sources": ["noaa_tsunami", "gdacs"],
        "metrics": ["magnitude", "categorie_alerte", "temps_arrivee_min"],
        "simulation_fields": [
            {"key": "magnitude", "label": "Magnitude du séisme", "unit": "Mw", "min": 5, "max": 9.5, "step": 0.1, "default": 8.0},
            {"key": "ocean_depth_m", "label": "Profondeur de l'océan", "unit": "m", "min": 500, "max": 7000, "step": 100, "default": 4000},
            {"key": "distance_coast_km", "label": "Distance à la côte", "unit": "km", "min": 10, "max": 5000, "step": 10, "default": 500},
        ],
    },
    {
        "id": "volcano",
        "label": "Volcans",
        "label_en": "Volcanoes",
        "color": "#ff9f43",
        "description": "Niveaux d'alerte, panaches de cendres, coulées et zones d'exclusion.",
        "sources": ["usgs_volcanoes", "gdacs", "nasa_eonet"],
        "metrics": ["niveau_alerte", "altitude_m", "vei"],
        "simulation_fields": [
            {"key": "vei", "label": "Indice d'explosivité (VEI)", "unit": "VEI", "min": 0, "max": 7, "step": 1, "default": 3},
            {"key": "wind_kmh", "label": "Vent en altitude", "unit": "km/h", "min": 0, "max": 200, "step": 5, "default": 30},
            {"key": "duration_h", "label": "Durée de l'éruption", "unit": "h", "min": 1, "max": 72, "step": 1, "default": 6},
        ],
    },
    {
        "id": "hurricane",
        "label": "Cyclones",
        "label_en": "Tropical cyclones",
        "color": "#c06bff",
        "description": "Vents, pression, rayon de vent fort, surcote et pluies.",
        "sources": ["nhc", "gdacs", "nasa_eonet"],
        "metrics": ["wind_kmh", "pressure_hpa", "category"],
        "simulation_fields": [
            {"key": "wind_kmh", "label": "Vents max.", "unit": "km/h", "min": 60, "max": 350, "step": 0.1, "default": 180},
            {"key": "pressure_hpa", "label": "Pression centrale", "unit": "hPa", "min": 850, "max": 1010, "step": 1, "default": 960},
            {"key": "rain_mm_h", "label": "Pluie", "unit": "mm/h", "min": 0, "max": 150, "step": 1, "default": 25},
            {"key": "duration_h", "label": "Durée", "unit": "h", "min": 1, "max": 72, "step": 1, "default": 12},
        ],
    },
    {
        "id": "flood",
        "label": "Inondations",
        "label_en": "Floods",
        "color": "#4f9dff",
        "description": "Crues signalées, pluies extrêmes et étendue estimée.",
        "sources": ["gdacs", "nasa_eonet"],
        "metrics": ["rain_mm_h", "duree_h", "surface_km2"],
        "simulation_fields": [
            {"key": "rain_mm_h", "label": "Pluie", "unit": "mm/h", "min": 1, "max": 200, "step": 1, "default": 30},
            {"key": "duration_h", "label": "Durée", "unit": "h", "min": 1, "max": 72, "step": 1, "default": 6},
            {"key": "radius_km", "label": "Bassin", "unit": "km", "min": 1, "max": 120, "step": 1, "default": 20},
        ],
    },
    {
        "id": "wildfire",
        "label": "Feux de forêt",
        "label_en": "Wildfires",
        "color": "#ff7a45",
        "description": "Foyers actifs, surface brûlée et propagation.",
        "sources": ["gdacs", "nasa_eonet"],
        "metrics": ["surface_km2", "wind_kmh"],
        "simulation_fields": [
            {"key": "wind_kmh", "label": "Vent", "unit": "km/h", "min": 0, "max": 120, "step": 1, "default": 30},
            {"key": "duration_h", "label": "Durée", "unit": "h", "min": 1, "max": 96, "step": 1, "default": 12},
            {"key": "slope_deg", "label": "Pente", "unit": "°", "min": 0, "max": 45, "step": 1, "default": 10},
        ],
    },
    {
        "id": "drought",
        "label": "Sécheresses",
        "label_en": "Droughts",
        "color": "#e0b24b",
        "description": "Déficits hydriques et stress agricole.",
        "sources": ["gdacs", "nasa_eonet"],
        "metrics": ["deficit_pct", "surface_km2"],
        "simulation_fields": [
            {"key": "rain_mm", "label": "Pluie observée", "unit": "mm", "min": 0, "max": 2000, "step": 5, "default": 120},
            {"key": "normal_mm", "label": "Normale de saison", "unit": "mm", "min": 1, "max": 3000, "step": 5, "default": 400},
            {"key": "duration_h", "label": "Durée", "unit": "jours", "min": 7, "max": 365, "step": 1, "default": 90},
        ],
    },
    {
        "id": "landslide",
        "label": "Glissements",
        "label_en": "Landslides",
        "color": "#a68a6b",
        "description": "Versants instables, pluie déclenchante et distance de parcours.",
        "sources": ["nasa_eonet", "gdacs"],
        "metrics": ["slope_deg", "rain_mm_h", "runout_km"],
        "simulation_fields": [
            {"key": "slope_deg", "label": "Pente", "unit": "°", "min": 5, "max": 60, "step": 1, "default": 28},
            {"key": "rain_mm_h", "label": "Pluie", "unit": "mm/h", "min": 0, "max": 150, "step": 1, "default": 25},
            {"key": "soil_moisture", "label": "Humidité du sol", "unit": "0–1", "min": 0, "max": 1, "step": 0.05, "default": 0.6},
            {"key": "height_m", "label": "Hauteur du versant", "unit": "m", "min": 5, "max": 2000, "step": 5, "default": 120},
        ],
    },
    {
        "id": "sandstorm",
        "label": "Tempêtes de sable",
        "label_en": "Sand and dust storms",
        "color": "#e8c27a",
        "description": "Visibilité, vents et transport de poussières.",
        "sources": ["nasa_eonet", "gdacs"],
        "metrics": ["wind_kmh", "visibility_km"],
        "simulation_fields": [
            {"key": "wind_kmh", "label": "Vent", "unit": "km/h", "min": 20, "max": 180, "step": 5, "default": 80},
            {"key": "duration_h", "label": "Durée", "unit": "h", "min": 1, "max": 48, "step": 1, "default": 6},
        ],
    },
    {
        "id": "blizzard",
        "label": "Blizzards",
        "label_en": "Blizzards",
        "color": "#8fd7ff",
        "description": "Neige, refroidissement éolien et visibilité.",
        "sources": ["nasa_eonet", "gdacs"],
        "metrics": ["snow_cm", "wind_chill_c", "visibility_km"],
        "simulation_fields": [
            {"key": "temperature_c", "label": "Température", "unit": "°C", "min": -60, "max": 5, "step": 1, "default": -8},
            {"key": "wind_kmh", "label": "Vent", "unit": "km/h", "min": 20, "max": 160, "step": 5, "default": 60},
            {"key": "snow_mm_h", "label": "Neige", "unit": "mm/h équivalent eau", "min": 0, "max": 50, "step": 1, "default": 8},
            {"key": "duration_h", "label": "Durée", "unit": "h", "min": 1, "max": 72, "step": 1, "default": 12},
        ],
    },
    {
        "id": "heatwave",
        "label": "Canicules",
        "label_en": "Heatwaves",
        "color": "#ff5f8f",
        "description": "Températures extrêmes, humidité et risque sanitaire.",
        "sources": ["nasa_eonet", "gdacs"],
        "metrics": ["temperature_c", "heat_index_c"],
        "simulation_fields": [
            {"key": "temperature_c", "label": "Température", "unit": "°C", "min": 25, "max": 55, "step": 1, "default": 40},
            {"key": "humidity_pct", "label": "Humidité relative", "unit": "%", "min": 0, "max": 100, "step": 1, "default": 30},
            {"key": "duration_h", "label": "Durée", "unit": "jours", "min": 1, "max": 30, "step": 1, "default": 5},
        ],
    },
    {
        "id": "tornado",
        "label": "Tornades",
        "label_en": "Tornadoes",
        "color": "#b6c6d6",
        "description": "Rafales, échelle de dommages et trajectoire.",
        "sources": ["nasa_eonet", "gdacs"],
        "metrics": ["wind_kmh", "ef_scale", "path_km"],
        "simulation_fields": [
            {"key": "wind_kmh", "label": "Vent", "unit": "km/h", "min": 90, "max": 420, "step": 5, "default": 200},
            {"key": "duration_h", "label": "Durée", "unit": "h", "min": 0.1, "max": 6, "step": 0.1, "default": 0.5},
        ],
    },
    {
        "id": "storm",
        "label": "Orages violents",
        "label_en": "Severe storms",
        "color": "#b6c6d6",
        "description": "Rafales, pluies intenses, grêle et foudre.",
        "sources": ["nasa_eonet", "gdacs"],
        "metrics": ["wind_kmh", "rain_mm_h", "hail_cm"],
        "simulation_fields": [
            {"key": "wind_kmh", "label": "Rafales", "unit": "km/h", "min": 40, "max": 200, "step": 5, "default": 90},
            {"key": "rain_mm_h", "label": "Pluie", "unit": "mm/h", "min": 0, "max": 120, "step": 1, "default": 25},
            {"key": "duration_h", "label": "Durée", "unit": "h", "min": 1, "max": 24, "step": 1, "default": 3},
        ],
    },
)

CATALOG_BY_ID = {item["id"]: item for item in CATALOG}


@dataclass(frozen=True)
class HazardEvent:
    """Un événement normalisé, avec sa provenance et ses valeurs d'origine."""

    id: str
    source: str
    source_id: str
    hazard: str
    title: str
    place: str | None
    lat: float
    lon: float
    time: datetime
    updated: datetime | None
    severity: str
    data_kind: str
    description: str | None = None
    country: str | None = None
    url: str | None = None
    metrics: tuple[dict[str, Any], ...] = ()
    also_reported_by: tuple[str, ...] = ()


@dataclass(frozen=True)
class SourceState:
    id: str
    name: str
    status: str  # ok | unavailable
    count: int
    fetched_at: datetime
    attribution: str
    attribution_url: str
    license: str
    error: str | None = None
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class HazardSnapshot:
    events: tuple[HazardEvent, ...]
    sources: tuple[SourceState, ...]
    generated_at: datetime
    stale: bool = False
    degraded: bool = False


Fetcher = Callable[[], list[HazardEvent]]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _find_element(element: ET.Element, name: str) -> ET.Element | None:
    for child in element.iter():
        if _local(child.tag) == name:
            return child
    return None


def _find_text(element: ET.Element, name: str, default: str | None = None) -> str | None:
    child = _find_element(element, name)
    if child is None:
        return default
    if child.text and child.text.strip():
        return child.text.strip()
    # Les résumés Atom/XHTML placent leur contenu dans des enfants : on
    # sérialise alors l'élément pour ne pas perdre le texte utile.
    inner = "".join(ET.tostring(node, encoding="unicode") for node in list(child))
    text = html.unescape(re.sub(r"<[^>]+>", " ", inner))
    text = re.sub(r"\s+", " ", text).strip()
    return text or default


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip()
    try:
        parsed = parsedate_to_datetime(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError, IndexError):
        pass
    try:
        normalized = text.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def _json_get(url: str) -> Any:
    response = httpx.get(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        timeout=REQUEST_TIMEOUT_SECONDS,
        follow_redirects=True,
    )
    response.raise_for_status()
    return response.json()


def _sanitize_xml(content: bytes) -> bytes:
    """Nettoie les caractères de contrôle et les « & » non échappés.

    Certains flux RSS publics publient occasionnellement du XML non valide
    (caractère de contrôle, esperluette brute). On ne fabrique aucune donnée :
    on rend seulement le document lisible, puis ElementTree valide la structure.
    """
    text = content.decode("utf-8", errors="replace")
    text = "".join(
        character
        for character in text
        if character in ("\t", "\n", "\r") or ord(character) >= 32
    )
    text = re.sub(r"&(?!(?:[A-Za-z][A-Za-z0-9]*|#\d+|#x[0-9A-Fa-f]+);)", "&amp;", text)
    return text.encode("utf-8")


def _xml_get(url: str) -> ET.Element:
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            response = httpx.get(
                url,
                headers={"User-Agent": USER_AGENT, "Accept": "application/xml, application/atom+xml, text/xml"},
                timeout=REQUEST_TIMEOUT_SECONDS,
                follow_redirects=True,
            )
            response.raise_for_status()
            return ET.fromstring(_sanitize_xml(response.content))
        except (ET.ParseError, httpx.HTTPError) as exc:
            last_error = exc
            if attempt == 0:
                time.sleep(0.7)
                continue
            raise
    raise RuntimeError(str(last_error))


def _severity_rank(severity: str) -> int:
    return SEVERITY_ORDER.get(severity, 0)


def _severity_for_magnitude(magnitude: float | None) -> str:
    if magnitude is None:
        return "unknown"
    if magnitude >= 7.0:
        return "extreme"
    if magnitude >= 6.0:
        return "high"
    if magnitude >= 4.5:
        return "moderate"
    return "low"


def _event_id(source: str, source_id: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9:_-]+", "-", source_id).strip("-")
    return f"{source}:{cleaned}"


def _coordinate_place(lat: float, lon: float) -> str:
    return f"{abs(lat):.2f}°{'N' if lat >= 0 else 'S'}, {abs(lon):.2f}°{'E' if lon >= 0 else 'O'}"


def _finite(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


# ---------------------------------------------------------------------------
# USGS — séismes
# ---------------------------------------------------------------------------


def parse_usgs_earthquakes(payload: Mapping[str, Any]) -> list[HazardEvent]:
    events: list[HazardEvent] = []
    for feature in payload.get("features", []):
        properties = feature.get("properties") or {}
        geometry = feature.get("geometry") or {}
        coordinates = geometry.get("coordinates") or []
        if len(coordinates) < 2:
            continue
        lon = _finite(coordinates[0])
        lat = _finite(coordinates[1])
        if lat is None or lon is None:
            continue
        magnitude = _finite(properties.get("mag"))
        depth = _finite(coordinates[2]) if len(coordinates) > 2 else None
        timestamp = _finite(properties.get("time"))
        if timestamp is None:
            continue
        moment = datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc)
        updated_ms = _finite(properties.get("updated"))
        updated = datetime.fromtimestamp(updated_ms / 1000, tz=timezone.utc) if updated_ms else None
        alert = (properties.get("alert") or "").lower()
        severity = {
            "red": "extreme",
            "orange": "high",
            "yellow": "moderate",
            "green": "low",
        }.get(alert) or _severity_for_magnitude(magnitude)
        metrics: list[dict[str, Any]] = []
        if magnitude is not None:
            metrics.append({"key": "magnitude", "label": "Magnitude", "value": round(magnitude, 1), "unit": "Mw"})
        if depth is not None:
            metrics.append({"key": "profondeur_km", "label": "Profondeur", "value": round(depth, 1), "unit": "km"})
        if properties.get("sig") is not None:
            metrics.append({"key": "significance", "label": "Significativité USGS", "value": properties.get("sig"), "unit": ""})
        if properties.get("mmi") is not None:
            metrics.append({"key": "intensite_mmi", "label": "Intensité MMI", "value": properties.get("mmi"), "unit": "MMI"})
        if properties.get("felt") is not None:
            metrics.append({"key": "ressenti", "label": "Personnes ayant ressenti", "value": properties.get("felt"), "unit": ""})
        place = properties.get("place") or _coordinate_place(lat, lon)
        title = properties.get("title") or (
            f"M {magnitude:.1f} — {place}" if magnitude is not None else f"Séisme — {place}"
        )
        source_id = str(properties.get("code") or properties.get("ids") or feature.get("id") or f"{lat},{lon},{timestamp}")
        events.append(
            HazardEvent(
                id=_event_id("usgs_earthquakes", source_id),
                source="usgs_earthquakes",
                source_id=source_id,
                hazard="earthquake",
                title=title,
                place=place,
                lat=lat,
                lon=lon,
                time=moment,
                updated=updated,
                severity=severity,
                data_kind="observation",
                description=properties.get("title"),
                url=properties.get("url"),
                metrics=tuple(metrics),
            )
        )
    return events


def fetch_usgs_earthquakes() -> list[HazardEvent]:
    return parse_usgs_earthquakes(_json_get(USGS_EARTHQUAKES_URL))


# ---------------------------------------------------------------------------
# GDACS — alertes multi-aléas
# ---------------------------------------------------------------------------

GDACS_TYPES = {
    "EQ": "earthquake",
    "TS": "tsunami",
    "VO": "volcano",
    "TC": "hurricane",
    "FL": "flood",
    "WF": "wildfire",
    "DR": "drought",
    "LS": "landslide",
    "DH": "sandstorm",
    "DS": "sandstorm",
    "ST": "storm",
    "SW": "storm",
    "CB": "storm",
    "SN": "blizzard",
    "HT": "heatwave",
    "TO": "tornado",
}


def parse_gdacs_feed(root: ET.Element) -> list[HazardEvent]:
    events: list[HazardEvent] = []
    for item in list(root.iter()):
        if _local(item.tag) != "item":
            continue
        fields: dict[str, str] = {}
        for child in list(item):
            name = _local(child.tag)
            if child.text and child.text.strip():
                fields[name] = child.text.strip()
        event_type = (fields.get("eventtype") or "").upper()
        hazard = GDACS_TYPES.get(event_type)
        if not hazard:
            continue
        if (fields.get("iscurrent") or "true").lower() not in ("true", "1", "yes"):
            continue
        lat = _finite(fields.get("lat"))
        lon = _finite(fields.get("long"))
        if lat is None or lon is None:
            point = fields.get("point")
            if point:
                parts = point.split()
                if len(parts) >= 2:
                    lat = _finite(parts[0])
                    lon = _finite(parts[1])
        if lat is None or lon is None:
            continue
        moment = _parse_date(fields.get("fromdate")) or _parse_date(fields.get("pubDate"))
        if moment is None:
            continue
        updated = _parse_date(fields.get("datemodified")) or _parse_date(fields.get("pubDate"))
        alert = (fields.get("alertlevel") or "").lower()
        severity = {"red": "extreme", "orange": "high", "yellow": "moderate", "green": "low"}.get(alert, "unknown")
        severity_text = fields.get("severity") or ""
        metrics: list[dict[str, Any]] = []
        magnitude = re.search(r"(?:Magnitude|magnitude)\s*([\d.]+)\s*M", severity_text)
        if magnitude:
            metrics.append({"key": "magnitude", "label": "Magnitude", "value": float(magnitude.group(1)), "unit": "Mw"})
        depth = re.search(r"Depth\s*:?\s*([\d.]+)\s*km", severity_text, re.IGNORECASE)
        if depth:
            metrics.append({"key": "profondeur_km", "label": "Profondeur", "value": float(depth.group(1)), "unit": "km"})
        wind = re.search(r"([\d.]+)\s*km/h", severity_text)
        if wind:
            metrics.append({"key": "wind_kmh", "label": "Vent maximal", "value": float(wind.group(1)), "unit": "km/h"})
        if fields.get("alertscore"):
            metrics.append({"key": "alertscore", "label": "Score d'alerte GDACS", "value": _finite(fields.get("alertscore")), "unit": ""})
        if fields.get("population"):
            metrics.append({"key": "population", "label": "Population exposée (GDACS)", "value": fields["population"], "unit": ""})
        name = fields.get("eventname") or fields.get("title") or hazard
        country = fields.get("country")
        place = name if not country or country.lower() in name.lower() else f"{name} — {country}"
        source_id = fields.get("guid") or f"{event_type}{fields.get('eventid', '')}"
        events.append(
            HazardEvent(
                id=_event_id("gdacs", source_id),
                source="gdacs",
                source_id=source_id,
                hazard=hazard,
                title=fields.get("title") or name,
                place=place[:240],
                lat=lat,
                lon=lon,
                time=moment,
                updated=updated,
                severity=severity,
                data_kind="alert",
                description=fields.get("description"),
                country=country[:120] if country else None,
                url=fields.get("link"),
                metrics=tuple(metrics),
            )
        )
    return events


def fetch_gdacs() -> list[HazardEvent]:
    return parse_gdacs_feed(_xml_get(GDACS_URL))


# ---------------------------------------------------------------------------
# NASA EONET — événements naturels
# ---------------------------------------------------------------------------

EONET_CATEGORIES = {
    # Seules les catégories qui correspondent à l'une des 13 familles suivies
    # sont reprises. Les catégories non ambiguës (par exemple « seaLakeIce »,
    # qui décrit des icebergs et non des blizzards) sont volontairement
    # ignorées plutôt que rattachées à une famille incorrecte.
    "earthquakes": "earthquake",
    "floods": "flood",
    "wildfires": "wildfire",
    "volcanoes": "volcano",
    "severeStorms": "storm",
    "drought": "drought",
    "dustHaze": "sandstorm",
    "landslides": "landslide",
    "snow": "blizzard",
    "temperatureExtremes": "heatwave",
}


def _eonet_point(event: Mapping[str, Any]) -> tuple[float, float, datetime] | None:
    geometries = [geo for geo in event.get("geometry", []) if isinstance(geo, Mapping)]
    if not geometries:
        return None
    for geo in reversed(geometries):
        coordinates = geo.get("coordinates")
        if isinstance(coordinates, list):
            if geo.get("type") == "Point" and len(coordinates) >= 2:
                lon = _finite(coordinates[0])
                lat = _finite(coordinates[1])
            elif geo.get("type") == "Polygon" and coordinates and isinstance(coordinates[0], list):
                ring = [point for point in coordinates[0] if isinstance(point, list) and len(point) >= 2]
                lon = sum(float(point[0]) for point in ring) / len(ring) if ring else None
                lat = sum(float(point[1]) for point in ring) / len(ring) if ring else None
            else:
                lon = lat = None
            if lat is not None and lon is not None:
                moment = _parse_date(str(geo.get("date"))) or _now()
                return lat, lon, moment
    return None


def parse_eonet_events(payload: Mapping[str, Any]) -> list[HazardEvent]:
    events: list[HazardEvent] = []
    for event in payload.get("events", []):
        if not isinstance(event, Mapping):
            continue
        point = _eonet_point(event)
        if point is None:
            continue
        lat, lon, moment = point
        categories = event.get("categories") or []
        category_ids = [str(item.get("id")) for item in categories if isinstance(item, Mapping)]
        hazard: str | None = None
        for category_id in category_ids:
            hazard = EONET_CATEGORIES.get(category_id)
            if hazard:
                break
        if hazard is None:
            continue
        title = str(event.get("title") or "Événement naturel")
        lowered = title.lower()
        if hazard == "storm" and any(word in lowered for word in ("cyclone", "hurricane", "typhoon")):
            hazard = "hurricane"
        # EONET publie aussi des feux prescrits (brûlages dirigés) dans la
        # catégorie « wildfires ». Ce ne sont pas des catastrophes en cours :
        # les afficher comme feux de forêt donnerait une fausse alerte.
        if hazard == "wildfire" and "prescribed" in lowered:
            continue
        geometries = [geo for geo in event.get("geometry", []) if isinstance(geo, Mapping)]
        metrics: list[dict[str, Any]] = []
        if geometries:
            latest = geometries[-1]
            magnitude = _finite(latest.get("magnitudeValue"))
            unit = str(latest.get("magnitudeUnit") or "")
            if magnitude is not None:
                label = "Intensité"
                value = magnitude
                if unit.lower() in ("kts", "knot", "knots"):
                    value = round(magnitude * 1.852, 1)
                    unit = "km/h"
                    label = "Vent maximal"
                metrics.append({"key": "intensite", "label": label, "value": value, "unit": unit})
        severity = "unknown"
        if hazard in ("hurricane", "storm") and metrics:
            wind = metrics[-1]["value"] if metrics[-1]["key"] == "intensite" else None
            if isinstance(wind, (int, float)):
                if wind >= 250:
                    severity = "extreme"
                elif wind >= 178:
                    severity = "high"
                elif wind >= 119:
                    severity = "moderate"
                elif wind >= 60:
                    severity = "low"
        source_id = str(event.get("id") or f"{title}:{moment.isoformat()}")
        sources = event.get("sources") or []
        link = event.get("link")
        if not link and sources and isinstance(sources[0], Mapping):
            link = sources[0].get("url")
        events.append(
            HazardEvent(
                id=_event_id("nasa_eonet", source_id),
                source="nasa_eonet",
                source_id=source_id,
                hazard=hazard,
                title=title,
                place=None,
                lat=lat,
                lon=lon,
                time=moment,
                updated=None,
                severity=severity,
                data_kind="observation",
                description=str(event.get("description")) if event.get("description") else None,
                url=str(link) if link else None,
                metrics=tuple(metrics),
            )
        )
    return events


def fetch_eonet() -> list[HazardEvent]:
    return parse_eonet_events(_json_get(EONET_URL))


# ---------------------------------------------------------------------------
# USGS — volcans en alerte
# ---------------------------------------------------------------------------


def parse_usgs_volcanoes(payload: Any) -> list[HazardEvent]:
    if not isinstance(payload, list):
        return []
    events: list[HazardEvent] = []
    for volcano in payload:
        if not isinstance(volcano, Mapping):
            continue
        lat = _finite(volcano.get("latitude"))
        lon = _finite(volcano.get("longitude"))
        if lat is None or lon is None:
            continue
        alert_level = str(volcano.get("alert_level") or "").upper()
        color = str(volcano.get("color_code") or "").upper()
        severity = "unknown"
        if alert_level == "WARNING" or color == "RED":
            severity = "extreme"
        elif alert_level == "WATCH" or color == "ORANGE":
            severity = "high"
        elif alert_level == "ADVISORY" or color == "YELLOW":
            severity = "moderate"
        elif alert_level == "NORMAL" or color == "GREEN":
            severity = "low"
        moment = _parse_date(str(volcano.get("sent_date_cap") or "")) or _parse_date(str(volcano.get("pubDate") or "")) or _now()
        name = str(volcano.get("volcano_name_appended") or "Volcan")
        observatory = str(volcano.get("obs_fullname") or "").strip()
        metrics: list[dict[str, Any]] = []
        if volcano.get("elevation_meters") is not None:
            metrics.append({"key": "altitude_m", "label": "Altitude", "value": volcano.get("elevation_meters"), "unit": "m"})
        if alert_level:
            metrics.append({"key": "niveau_alerte", "label": "Niveau d'alerte", "value": alert_level, "unit": ""})
        if color:
            metrics.append({"key": "code_couleur", "label": "Code couleur", "value": color, "unit": ""})
        synopsis = str(volcano.get("synopsis") or "").strip() or None
        events.append(
            HazardEvent(
                id=_event_id("usgs_volcanoes", str(volcano.get("guid") or name)),
                source="usgs_volcanoes",
                source_id=str(volcano.get("guid") or name),
                hazard="volcano",
                title=f"Volcan {name} — {alert_level.title() if alert_level else 'activité signalée'}",
                place=f"{name}{', ' + observatory if observatory else ''}",
                lat=lat,
                lon=lon,
                time=moment,
                updated=_parse_date(str(volcano.get("sent_date_cap") or "")),
                severity=severity,
                data_kind="alert",
                description=synopsis,
                url=str(volcano.get("notice_url") or "") or None,
                metrics=tuple(metrics),
            )
        )
    return events


def fetch_usgs_volcanoes() -> list[HazardEvent]:
    return parse_usgs_volcanoes(_json_get(USGS_VOLCANOES_URL))


# ---------------------------------------------------------------------------
# NOAA — tsunamis
# ---------------------------------------------------------------------------

TSUNAMI_SEVERITY = {
    "warning": "extreme",
    "advisory": "high",
    "watch": "moderate",
    "information": "low",
}


def parse_tsunami_atom(root: ET.Element, feed_name: str = "NOAA") -> list[HazardEvent]:
    events: list[HazardEvent] = []
    for entry in list(root.iter()):
        if _local(entry.tag) != "entry":
            continue
        title = _find_text(entry, "title") or "Bulletin tsunami"
        updated = _parse_date(_find_text(entry, "updated"))
        if updated is None:
            continue
        lat = _finite(_find_text(entry, "lat"))
        lon = _finite(_find_text(entry, "long"))
        if lat is None or lon is None:
            continue
        summary = _find_text(entry, "summary") or ""
        text = html.unescape(re.sub(r"<[^>]+>", " ", summary))
        text = re.sub(r"\s+", " ", text).strip()
        category_match = re.search(r"Category\s*:\s*([A-Za-z]+)", text, re.IGNORECASE)
        category = category_match.group(1).lower() if category_match else ""
        if category not in TSUNAMI_SEVERITY:
            continue
        if "no tsunami danger" in text.lower() or "no threat" in text.lower():
            continue
        if category in ("information", "cancellation"):
            continue
        magnitude_match = re.search(r"Preliminary Magnitude\s*:\s*([\d.]+)", text, re.IGNORECASE)
        magnitude = float(magnitude_match.group(1)) if magnitude_match else None
        metrics: list[dict[str, Any]] = [
            {"key": "categorie_alerte", "label": "Catégorie", "value": category.title(), "unit": ""},
        ]
        if magnitude is not None:
            metrics.append({"key": "magnitude", "label": "Magnitude préliminaire", "value": magnitude, "unit": "Mw"})
        link = None
        for child in list(entry):
            if _local(child.tag) == "link" and child.attrib.get("rel") == "alternate":
                link = child.attrib.get("href")
                break
        source_id = _find_text(entry, "id") or f"{feed_name}:{title}:{updated.isoformat()}"
        events.append(
            HazardEvent(
                id=_event_id("noaa_tsunami", source_id),
                source="noaa_tsunami",
                source_id=source_id,
                hazard="tsunami",
                title=f"Tsunami — {category.title() if category else 'bulletin'} : {title}",
                place=title,
                lat=lat,
                lon=lon,
                time=updated,
                updated=updated,
                severity=TSUNAMI_SEVERITY[category],
                data_kind="alert",
                description=text[:1200] or None,
                country=None,
                url=link,
                metrics=tuple(metrics),
            )
        )
    return events


def fetch_noaa_tsunami() -> list[HazardEvent]:
    events: list[HazardEvent] = []
    errors: list[str] = []
    for feed in NOAA_TSUNAMI_FEEDS:
        try:
            events.extend(parse_tsunami_atom(_xml_get(feed), feed.rsplit("/", 1)[-1].replace("Atom.xml", "")))
        except Exception as exc:  # un bassin en panne ne doit pas masquer l'autre
            errors.append(f"{feed.rsplit('/', 1)[-1]}: {exc}")
    if errors and not events:
        raise RuntimeError("; ".join(errors))
    return events


# ---------------------------------------------------------------------------
# NOAA — cyclones tropicaux
# ---------------------------------------------------------------------------


def _parse_coordinate(value: Any, positive: str, negative: str) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return None
    text = value.strip().upper()
    number = _finite(re.sub(r"[^0-9.+-]", "", text))
    if number is None:
        return None
    if negative in text and number > 0:
        number = -number
    return number


def parse_nhc_storms(payload: Mapping[str, Any]) -> list[HazardEvent]:
    events: list[HazardEvent] = []
    storms = payload.get("activeStorms") or []
    if not isinstance(storms, list):
        return events
    for storm in storms:
        if not isinstance(storm, Mapping):
            continue
        lat = _parse_coordinate(storm.get("latitude"), "N", "S")
        lon = _parse_coordinate(storm.get("longitude"), "E", "W")
        if lat is None or lon is None:
            continue
        intensity = _finite(storm.get("intensity"))
        wind_kmh = round(intensity * 1.852, 1) if intensity is not None else None
        classification = str(storm.get("classification") or "Cyclone tropical")
        name = str(storm.get("name") or storm.get("id") or "Cyclone")
        moment = _parse_date(str(storm.get("lastUpdate") or storm.get("advisoryDate") or "")) or _now()
        severity = "unknown"
        if wind_kmh is not None:
            if wind_kmh >= 250:
                severity = "extreme"
            elif wind_kmh >= 178:
                severity = "high"
            elif wind_kmh >= 119:
                severity = "moderate"
            else:
                severity = "low"
        pressure = _finite(storm.get("pressure"))
        metrics: list[dict[str, Any]] = []
        if wind_kmh is not None:
            metrics.append({"key": "wind_kmh", "label": "Vent maximal", "value": wind_kmh, "unit": "km/h"})
        if pressure is not None:
            metrics.append({"key": "pressure_hpa", "label": "Pression centrale", "value": pressure, "unit": "hPa"})
        if storm.get("movementDir") and storm.get("movementSpeed"):
            metrics.append({
                "key": "deplacement",
                "label": "Déplacement",
                "value": f"{storm.get('movementDir')} {storm.get('movementSpeed')} kt",
                "unit": "",
            })
        source_id = str(storm.get("id") or name)
        events.append(
            HazardEvent(
                id=_event_id("nhc", source_id),
                source="nhc",
                source_id=source_id,
                hazard="hurricane",
                title=f"{classification} {name}",
                place=str(storm.get("name") or name),
                lat=lat,
                lon=lon,
                time=moment,
                updated=moment,
                severity=severity,
                data_kind="observation",
                description=str(storm.get("publicAdvisory") or "") or None,
                url=str(storm.get("publicAdvisory") or "https://www.nhc.noaa.gov/"),
                metrics=tuple(metrics),
            )
        )
    return events


def fetch_nhc() -> list[HazardEvent]:
    return parse_nhc_storms(_json_get(NHC_STORMS_URL))


# ---------------------------------------------------------------------------
# Agrégation, déduplication et cache
# ---------------------------------------------------------------------------

DEFAULT_FETCHERS: dict[str, Fetcher] = {
    "usgs_earthquakes": fetch_usgs_earthquakes,
    "gdacs": fetch_gdacs,
    "nasa_eonet": fetch_eonet,
    "usgs_volcanoes": fetch_usgs_volcanoes,
    "noaa_tsunami": fetch_noaa_tsunami,
    "nhc": fetch_nhc,
}

DEDUPE_DISTANCE_KM = {
    "earthquake": 180,
    "tsunami": 350,
    "volcano": 25,
    "hurricane": 450,
    "storm": 450,
    "flood": 120,
    "wildfire": 80,
    "drought": 700,
    "landslide": 80,
    "sandstorm": 450,
    "blizzard": 450,
    "heatwave": 450,
    "tornado": 120,
}
DEDUPE_WINDOW_HOURS = {
    "earthquake": 4,
    "tsunami": 8,
    "volcano": 24 * 14,
    "hurricane": 36,
    "storm": 18,
    "flood": 72,
    "wildfire": 96,
    "drought": 24 * 45,
    "landslide": 72,
    "sandstorm": 48,
    "blizzard": 48,
    "heatwave": 72,
    "tornado": 24,
}


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * radius * math.asin(min(1.0, math.sqrt(a)))


def dedupe(events: list[HazardEvent]) -> tuple[HazardEvent, ...]:
    """Conserve une fiche par événement, priorité aux sources spécialisées."""
    ordered = sorted(
        events,
        key=lambda event: (
            SOURCE_PRIORITY.get(event.source, 99),
            -_severity_rank(event.severity),
            -event.time.timestamp(),
        ),
    )
    kept: list[HazardEvent] = []
    for event in ordered:
        duplicate_index: int | None = None
        for index, existing in enumerate(kept):
            if existing.hazard != event.hazard:
                continue
            distance = haversine_km(existing.lat, existing.lon, event.lat, event.lon)
            if distance > DEDUPE_DISTANCE_KM.get(event.hazard, 200):
                continue
            window = DEDUPE_WINDOW_HOURS.get(event.hazard, 48)
            if abs((existing.time - event.time).total_seconds()) > window * 3600:
                continue
            duplicate_index = index
            break
        if duplicate_index is None:
            kept.append(event)
        else:
            existing = kept[duplicate_index]
            if event.source not in existing.also_reported_by and event.source != existing.source:
                kept[duplicate_index] = replace(
                    existing,
                    also_reported_by=existing.also_reported_by + (event.source,),
                )
    return tuple(kept)


def _safe_fetch(source_id: str, fetcher: Fetcher, moment: datetime) -> tuple[SourceState, list[HazardEvent]]:
    meta = SOURCE_META[source_id]
    try:
        events = fetcher()
        valid = [
            event for event in events
            if math.isfinite(event.lat) and math.isfinite(event.lon)
            and -90 <= event.lat <= 90 and -180 <= event.lon <= 180
        ]
        return (
            SourceState(
                id=source_id,
                name=meta["name"],
                status="ok",
                count=len(valid),
                fetched_at=moment,
                attribution=meta["attribution"],
                attribution_url=meta["home"],
                license=meta["license"],
            ),
            valid,
        )
    except Exception as exc:  # une source ne doit jamais casser l'agrégation
        return (
            SourceState(
                id=source_id,
                name=meta["name"],
                status="unavailable",
                count=0,
                fetched_at=moment,
                attribution=meta["attribution"],
                attribution_url=meta["home"],
                license=meta["license"],
                error=str(exc)[:300],
            ),
            [],
        )


_cache: dict[str, HazardSnapshot] = {}
_cache_lock = threading.Lock()


def load_snapshot(
    *,
    now: datetime | None = None,
    force: bool = False,
    fetchers: Mapping[str, Fetcher] | None = None,
) -> HazardSnapshot:
    """Agrège les sources avec cache, parallélisme et repli périmé honnête."""
    moment = now or _now()
    with _cache_lock:
        cached = _cache.get("world")
    if (
        not force
        and fetchers is None
        and cached is not None
        and (moment - cached.generated_at).total_seconds() < CACHE_TTL_SECONDS
    ):
        return cached

    active = dict(DEFAULT_FETCHERS if fetchers is None else fetchers)
    results: list[tuple[SourceState, list[HazardEvent]]] = []
    with ThreadPoolExecutor(max_workers=max(1, len(active))) as pool:
        futures = {
            source_id: pool.submit(_safe_fetch, source_id, fetcher, moment)
            for source_id, fetcher in active.items()
        }
        for source_id in active:
            try:
                results.append(futures[source_id].result())
            except Exception as exc:  # protection supplémentaire
                meta = SOURCE_META.get(source_id, {"name": source_id, "attribution": source_id, "home": "", "license": ""})
                results.append((
                    SourceState(
                        id=source_id, name=meta["name"], status="unavailable", count=0,
                        fetched_at=moment, attribution=meta["attribution"],
                        attribution_url=meta["home"], license=meta["license"], error=str(exc)[:300],
                    ),
                    [],
                ))

    all_events = [event for _, events in results for event in events]
    deduped = dedupe(all_events)[:MAX_EVENTS]
    states = tuple(state for state, _ in results)
    healthy = any(state.status == "ok" for state in states)

    if not healthy and not deduped:
        if cached is not None and (moment - cached.generated_at).total_seconds() <= STALE_MAX_SECONDS:
            return HazardSnapshot(
                events=cached.events,
                sources=states,
                generated_at=cached.generated_at,
                stale=True,
                degraded=True,
            )
        return HazardSnapshot(
            events=(),
            sources=states,
            generated_at=moment,
            stale=False,
            degraded=True,
        )

    snapshot = HazardSnapshot(
        events=deduped,
        sources=states,
        generated_at=moment,
        stale=False,
        degraded=any(state.status != "ok" for state in states),
    )
    with _cache_lock:
        _cache["world"] = snapshot
    return snapshot


def payload(snapshot: HazardSnapshot, *, now: datetime | None = None) -> dict[str, Any]:
    moment = now or _now()
    counts = Counter(event.hazard for event in snapshot.events)
    severities = Counter(event.severity for event in snapshot.events)
    age_seconds = max(0, int((moment - snapshot.generated_at).total_seconds()))
    return {
        "generated_at": snapshot.generated_at.isoformat(),
        "scope": "worldwide",
        "available": bool(snapshot.events) or any(state.status == "ok" for state in snapshot.sources),
        "stale": snapshot.stale,
        "degraded": snapshot.degraded,
        "age_seconds": age_seconds,
        "total_events": len(snapshot.events),
        "counts_by_type": {hazard: counts.get(hazard, 0) for hazard in HAZARD_IDS},
        "counts_by_severity": {severity: severities.get(severity, 0) for severity in ("low", "moderate", "high", "extreme", "unknown")},
        "events": [
            {
                "id": event.id,
                "source": event.source,
                "source_id": event.source_id,
                "hazard": event.hazard,
                "title": event.title,
                "place": event.place,
                "lat": round(event.lat, 5),
                "lon": round(event.lon, 5),
                "time": event.time.isoformat(),
                "updated": event.updated.isoformat() if event.updated else None,
                "severity": event.severity,
                "severity_label": SEVERITY_LABEL.get(event.severity, SEVERITY_LABEL["unknown"]),
                "data_kind": event.data_kind,
                "description": event.description,
                "country": event.country,
                "url": event.url,
                "metrics": list(event.metrics),
                "also_reported_by": list(event.also_reported_by),
                "attribution": SOURCE_META.get(event.source, {}).get("attribution", event.source),
            }
            for event in snapshot.events
        ],
        "sources": [
            {
                "id": state.id,
                "name": state.name,
                "status": state.status,
                "count": state.count,
                "fetched_at": state.fetched_at.isoformat(),
                "attribution": state.attribution,
                "attribution_url": state.attribution_url,
                "license": state.license,
                "error": state.error,
                "warnings": list(state.warnings),
            }
            for state in snapshot.sources
        ],
        "attribution": ATTRIBUTION,
        "attribution_url": ATTRIBUTION_URL,
        "license": LICENSE,
        "limitations": list(LIMITATIONS),
    }


def catalog_payload() -> dict[str, Any]:
    return {
        "hazards": list(CATALOG),
        "count": len(CATALOG),
        "attribution": ATTRIBUTION,
        "disclaimer": (
            "Les simulations MasterEarth sont des modèles indicatifs déterministes. "
            "Elles ne constituent ni une prévision officielle ni une alerte."
        ),
    }


def unavailable_payload(*, now: datetime | None = None) -> dict[str, Any]:
    moment = now or _now()
    return {
        "generated_at": moment.isoformat(),
        "scope": "worldwide",
        "available": False,
        "stale": True,
        "degraded": True,
        "age_seconds": 0,
        "total_events": 0,
        "counts_by_type": {hazard: 0 for hazard in HAZARD_IDS},
        "counts_by_severity": {severity: 0 for severity in ("low", "moderate", "high", "extreme", "unknown")},
        "events": [],
        "sources": [],
        "attribution": ATTRIBUTION,
        "attribution_url": ATTRIBUTION_URL,
        "license": LICENSE,
        "limitations": list(LIMITATIONS) + ("Aucune source n'a répondu : aucun événement n'est affiché plutôt qu'un faux zéro.",),
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
                host for host, stamps in _requests.items()
                if not stamps or now - stamps[-1] >= RATE_LIMIT_WINDOW_SECONDS
            ]:
                _requests.pop(stale_host, None)
        return True


def reset_rate_limit() -> None:
    with _requests_lock:
        _requests.clear()
