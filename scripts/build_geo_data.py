#!/usr/bin/env python3
"""Construit le jeu de données géographiques statiques du globe CesiumJS.

Sources libres / ouvertes (aucune clé, aucun service payant) :

* GeoNames ``cities15000.zip``, ``admin1CodesASCII.txt`` et ``countryInfo.txt``
  — licence CC BY 4.0 (https://www.geonames.org/).
* Natural Earth ``ne_110m_admin_0_countries`` (pays) et
  ``ne_*_admin_1_states_provinces`` (régions/provinces/États) — domaine public
  (https://www.naturalearthdata.com/).

Fichiers produits (jamais versionnés à la main) :

* ``apps/web/public/geo/places.json``      — lieux mondiaux, une ligne par lieu ;
* ``apps/web/public/geo/countries.geojson`` — polygones des pays ;
* ``apps/web/public/geo/admin1.geojson``    — polygones de premier niveau.

Le cache de téléchargement se trouve dans ``scripts/.geo-cache/`` ; il n'est pas
versionné (voir ``.gitignore``) et peut être supprimé sans risque.

Utilisation :

    python scripts/build_geo_data.py              # construit (sources en cache)
    python scripts/build_geo_data.py --force      # re-télécharge toutes les sources
    python scripts/build_geo_data.py --verify     # valide les fichiers existants

Le script est idempotent : les sources déjà téléchargées sont réutilisées, les
sorties sont réécrites de façon déterministe (mêmes entrées → mêmes octets, à
la date de génération près). Aucun secret, aucune variable d'environnement
obligatoire. Le rendu JSON est compact, UTF-8, ``ensure_ascii=False``.

Le module ``shapely`` est utilisé s'il est disponible (simplification
topologique) ; sinon un Douglas-Peucker pur Python prend le relais. Le lecteur
Shapefile/DBF est inclus dans ce fichier : aucune dépendance GDAL/pyshp n'est
nécessaire.
"""

from __future__ import annotations

import argparse
import datetime as dt
import io
import json
import math
import os
import re
import shutil
import struct
import sys
import time
import unicodedata
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from typing import Iterable, Iterator, Sequence

try:  # Simplification topologique si disponible (recommandé).
    import shapely
    from shapely.geometry import MultiPolygon, Polygon
except Exception:  # pragma: no cover - dépend de l'environnement
    shapely = None
    MultiPolygon = Polygon = None

# ---------------------------------------------------------------------------
# Chemins et contraintes
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_DIR = Path(__file__).resolve().parent
CACHE_DIR = SCRIPT_DIR / ".geo-cache"
OUT_DIR = REPO_ROOT / "apps" / "web" / "public" / "geo"

PLACES_PATH = OUT_DIR / "places.json"
COUNTRIES_PATH = OUT_DIR / "countries.geojson"
ADMIN1_PATH = OUT_DIR / "admin1.geojson"

# Budgets volontairement exprimés en octets décimaux : ils restent valables
# que le lecteur interprète « Mo » comme 10^6 ou 2^20.
MAX_PLACES_BYTES = 2_800_000
MAX_COUNTRIES_BYTES = 900_000
MAX_ADMIN1_BYTES = 2_500_000

PLACES_VERSION = 1
PLACES_FIELDS = [
    "name",
    "lat",
    "lon",
    "population",
    "country_code",
    "country",
    "admin1",
    "capital",
]
PLACES_ATTRIBUTION = "GeoNames (CC BY 4.0) — https://www.geonames.org/"

# Noms d'affichage des pays. GeoNames nomme la Côte d'Ivoire avec l'exonyme
# anglais « Ivory Coast » ; Natural Earth (countries.geojson) et l'interface
# IntelliFlood utilisent le nom officiel « Côte d'Ivoire ». On aligne donc les
# deux fichiers sur ce seul libellé, explicitement et de façon traçable.
COUNTRY_DISPLAY_NAMES: dict[str, str] = {
    "CI": "Côte d'Ivoire",
}

COUNTRY_SIMPLIFY_DEG = 0.05
COUNTRY_ROUND_DIGITS = 3
ADMIN1_SIMPLIFY_DEG = 0.15
ADMIN1_ROUND_DIGITS = 2

# Garde-fous de couverture pour admin1.geojson.
ADMIN1_MIN_FEATURES = 400
ADMIN1_MIN_COUNTRIES = 25

USER_AGENT = (
    "IntelliFlood-geo-builder/1.0 "
    "(dataset statique du globe; +https://www.intelliflood.local)"
)

GEONAMES_DUMP = "https://download.geonames.org/export/dump/"
NE_110M = "https://naciscdn.org/naturalearth/110m/cultural/"
NE_50M = "https://naciscdn.org/naturalearth/50m/cultural/"
NE_10M = "https://naciscdn.org/naturalearth/10m/cultural/"

SOURCES: dict[str, dict[str, str]] = {
    "cities15000": {
        "url": GEONAMES_DUMP + "cities15000.zip",
        "file": "cities15000.zip",
        "kind": "zip",
    },
    "admin1_codes": {
        "url": GEONAMES_DUMP + "admin1CodesASCII.txt",
        "file": "admin1CodesASCII.txt",
        "kind": "text",
    },
    "country_info": {
        "url": GEONAMES_DUMP + "countryInfo.txt",
        "file": "countryInfo.txt",
        "kind": "text",
    },
    "ne_admin0_countries": {
        "url": NE_110M + "ne_110m_admin_0_countries.zip",
        "file": "ne_110m_admin_0_countries.zip",
        "kind": "zip",
    },
    # Natural Earth ne publie pas de couverture mondiale complète de l'admin-1
    # au 1:50m : ce fichier ne contient qu'environ 300 entités. Il reste essayé
    # en premier (léger), puis on bascule sur le 1:10m (couverture mondiale).
    "ne_admin1_50m": {
        "url": NE_50M + "ne_50m_admin_1_states_provinces.zip",
        "file": "ne_50m_admin_1_states_provinces.zip",
        "kind": "zip",
    },
    "ne_admin1_50m_lakes": {
        "url": NE_50M + "ne_50m_admin_1_states_provinces_lakes.zip",
        "file": "ne_50m_admin_1_states_provinces_lakes.zip",
        "kind": "zip",
    },
    "ne_admin1_10m": {
        "url": NE_10M + "ne_10m_admin_1_states_provinces.zip",
        "file": "ne_10m_admin_1_states_provinces.zip",
        "kind": "zip",
    },
}

# (clé de source, nom de base des fichiers shapefile, libellé lisible)
ADMIN1_CANDIDATES: tuple[tuple[str, str, str], ...] = (
    ("ne_admin1_50m", "ne_50m_admin_1_states_provinces", "Natural Earth 1:50m admin-1"),
    (
        "ne_admin1_50m_lakes",
        "ne_50m_admin_1_states_provinces_lakes",
        "Natural Earth 1:50m admin-1 (variante lacs)",
    ),
    ("ne_admin1_10m", "ne_10m_admin_1_states_provinces", "Natural Earth 1:10m admin-1"),
)


class BuildError(RuntimeError):
    """Erreur de construction / de source, message destiné à l'utilisateur."""


class VerifyError(RuntimeError):
    """Échec de validation d'un fichier produit."""


# ---------------------------------------------------------------------------
# Petites aides d'affichage
# ---------------------------------------------------------------------------


def info(message: str) -> None:
    print(message, flush=True)


def _configure_output() -> None:
    """Sortie UTF-8 même quand stdout est un tube (sinon cp1252 sous Windows)."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        try:
            reconfigure(encoding="utf-8", errors="replace")
        except (OSError, ValueError):
            pass


def human_bytes(size: int) -> str:
    return f"{size:,} B ({size / 1_048_576:.2f} MiB)".replace(",", " ")


def build_date() -> str:
    """Date UTC de génération, surchargeable pour des builds reproductibles."""
    override = os.environ.get("INTELLIFLOOD_GEO_DATE", "").strip()
    if override:
        try:
            dt.date.fromisoformat(override)
        except ValueError as exc:
            raise BuildError(
                f"INTELLIFLOOD_GEO_DATE={override!r} n'est pas une date ISO (AAAA-MM-JJ)"
            ) from exc
        return override
    return dt.datetime.now(dt.timezone.utc).date().isoformat()


# ---------------------------------------------------------------------------
# Téléchargement et extraction
# ---------------------------------------------------------------------------


def cache_path(key: str) -> Path:
    return CACHE_DIR / SOURCES[key]["file"]


def download(key: str, force: bool = False) -> Path:
    """Télécharge une source dans le cache (ou réutilise le fichier existant)."""
    source = SOURCES[key]
    destination = cache_path(key)
    if destination.exists() and destination.stat().st_size > 0 and not force:
        if source["kind"] != "zip" or zipfile.is_zipfile(destination):
            return destination
        info(f"[cache] {destination.name} illisible, nouveau téléchargement")

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(destination.name + ".part")
    attempt = 0
    while True:
        attempt += 1
        try:
            info(f"[download] {source['url']}")
            request = urllib.request.Request(
                source["url"], headers={"User-Agent": USER_AGENT}
            )
            with urllib.request.urlopen(request, timeout=180) as response:
                with open(temporary, "wb") as handle:
                    shutil.copyfileobj(response, handle, 1 << 20)
            break
        except (urllib.error.HTTPError, urllib.error.URLError, OSError) as exc:
            temporary.unlink(missing_ok=True)
            detail = getattr(exc, "code", None)
            reason = f"HTTP {detail}" if detail else str(exc)
            if attempt >= 2:
                raise BuildError(
                    f"téléchargement impossible: {source['url']} ({reason}). "
                    f"Vérifier l'accès réseau puis relancer "
                    f"(cache: {CACHE_DIR})."
                ) from exc
            info(f"[download] échec ({reason}), nouvelle tentative dans 2 s")
            time.sleep(2)

    size = temporary.stat().st_size
    if size == 0:
        temporary.unlink(missing_ok=True)
        raise BuildError(f"téléchargement vide: {source['url']}")
    if source["kind"] == "zip" and not zipfile.is_zipfile(temporary):
        temporary.unlink(missing_ok=True)
        raise BuildError(
            f"le fichier téléchargé n'est pas un ZIP valide: {source['url']} "
            "(page d'erreur du serveur ?)"
        )
    os.replace(temporary, destination)
    info(f"[cache]    {destination.name} — {human_bytes(size)}")
    return destination


def ensure_shapefile(zip_path: Path, stem: str) -> tuple[Path, Path]:
    """Extrait ``.shp``/``.dbf`` (+ annexes) d'une archive Natural Earth."""
    target = CACHE_DIR / f"{stem}_extracted"
    shp = target / f"{stem}.shp"
    dbf = target / f"{stem}.dbf"
    if (
        shp.exists()
        and dbf.exists()
        and shp.stat().st_mtime >= zip_path.stat().st_mtime
    ):
        return shp, dbf

    try:
        with zipfile.ZipFile(zip_path) as archive:
            members: dict[str, str] = {}
            for member in archive.namelist():
                name = Path(member).name  # aplatit, bloque les chemins relatifs
                if Path(name).suffix.lower() in {".shp", ".shx", ".dbf", ".prj", ".cpg"}:
                    members[name] = member
            missing = {f"{stem}.shp", f"{stem}.dbf"} - set(members)
            if missing:
                raise BuildError(
                    f"{zip_path.name}: fichiers manquants {sorted(missing)}"
                )
            target.mkdir(parents=True, exist_ok=True)
            for name, member in members.items():
                with archive.open(member) as source, open(target / name, "wb") as sink:
                    shutil.copyfileobj(source, sink, 1 << 20)
    except zipfile.BadZipFile as exc:
        raise BuildError(f"{zip_path.name}: archive corrompue ({exc})") from exc
    except OSError as exc:
        raise BuildError(f"extraction impossible de {zip_path.name}: {exc}") from exc
    return shp, dbf


# ---------------------------------------------------------------------------
# Lecteurs Shapefile / DBF minimalistes (sans GDAL ni pyshp)
# ---------------------------------------------------------------------------


def _check_shp_header(header: bytes) -> None:
    if len(header) < 100 or struct.unpack(">i", header[0:4])[0] != 9994:
        raise BuildError("fichier .shp invalide (en-tête inattendu)")


def count_shp_records(shp_path: Path) -> int:
    count = 0
    with open(shp_path, "rb") as handle:
        _check_shp_header(handle.read(100))
        while True:
            record_header = handle.read(8)
            if len(record_header) < 8:
                break
            _, words = struct.unpack(">ii", record_header)
            handle.seek(words * 2, os.SEEK_CUR)
            count += 1
    return count


def count_dbf_records(dbf_path: Path) -> int:
    with open(dbf_path, "rb") as handle:
        header = handle.read(32)
    if len(header) < 32:
        raise BuildError(f"{dbf_path.name}: en-tête DBF tronqué")
    return struct.unpack("<I", header[4:8])[0]


def iter_shp_geometries(shp_path: Path) -> Iterator[list[list[tuple[float, float]]]]:
    """Itère les enregistrements d'un Shapefile polygonal.

    Chaque enregistrement produit une liste d'anneaux fermés ``[(x, y), ...]``
    (vide pour un NullShape). Le fichier est lu en flux : la mémoire reste
    bornée même pour le jeu admin-1 1:10m (plusieurs centaines de milliers de
    sommets).
    """
    with open(shp_path, "rb") as handle:
        _check_shp_header(handle.read(100))
        index = -1
        while True:
            record_header = handle.read(8)
            if len(record_header) < 8:
                break
            index += 1
            _, words = struct.unpack(">ii", record_header)
            content = handle.read(words * 2)
            if len(content) < 4:
                raise BuildError(f"{shp_path.name}: enregistrement {index} tronqué")
            shape_type = struct.unpack("<i", content[0:4])[0]
            if shape_type == 0:  # NullShape
                yield []
                continue
            if shape_type not in (5, 15, 25):  # Polygon / PolygonZ / PolygonM
                raise BuildError(
                    f"{shp_path.name}: enregistrement {index} de type {shape_type} "
                    "non polygonal (fichier inattendu)"
                )
            num_parts, num_points = struct.unpack("<ii", content[36:44])
            if num_parts <= 0 or num_points <= 0:
                yield []
                continue
            parts = struct.unpack(f"<{num_parts}i", content[44 : 44 + 4 * num_parts])
            points_start = 44 + 4 * num_parts
            flat = struct.unpack(
                f"<{num_points * 2}d",
                content[points_start : points_start + 16 * num_points],
            )
            rings: list[list[tuple[float, float]]] = []
            for part_index, start in enumerate(parts):
                end = parts[part_index + 1] if part_index + 1 < num_parts else num_points
                if end - start < 3:
                    continue
                rings.append(
                    [(flat[2 * point], flat[2 * point + 1]) for point in range(start, end)]
                )
            yield rings


def iter_dbf_records(dbf_path: Path) -> Iterator[dict[str, str] | None]:
    """Itère les enregistrements d'un DBF (``None`` pour un enregistrement supprimé)."""
    raw = dbf_path.read_bytes()
    if len(raw) < 32:
        raise BuildError(f"{dbf_path.name}: en-tête DBF tronqué")
    record_count, header_length, record_length = struct.unpack("<IHH", raw[4:12])
    fields: list[tuple[str, int]] = []
    offset = 32
    while offset < header_length and raw[offset] != 0x0D:
        name = raw[offset : offset + 11].split(b"\x00")[0].decode("ascii", "replace").strip()
        length = raw[offset + 16]
        if name:
            fields.append((name, length))
        offset += 32
    if not fields:
        raise BuildError(f"{dbf_path.name}: aucun champ DBF")

    encoding = "utf-8"
    code_page = dbf_path.with_suffix(".cpg")
    if code_page.exists():
        declared = code_page.read_text("ascii", errors="ignore").strip()
        if declared:
            encoding = declared

    position = header_length
    for _ in range(record_count):
        record = raw[position : position + record_length]
        position += record_length
        if len(record) < record_length:
            break
        if record[:1] == b"*":
            yield None
            continue
        values: dict[str, str] = {}
        cursor = 1
        for name, length in fields:
            values[name] = (
                record[cursor : cursor + length]
                .decode(encoding, "replace")
                .replace("\x00", "")
                .strip()
            )
            cursor += length
        yield values


# ---------------------------------------------------------------------------
# Géométrie : anneaux -> polygones -> GeoJSON simplifié
# ---------------------------------------------------------------------------


def _signed_area(ring: Sequence[Sequence[float]]) -> float:
    """Aire signée (shoelace) ; positive = sens antihoraire."""
    if len(ring) < 4:
        return 0.0
    total = 0.0
    x0, y0 = ring[0]
    for x1, y1 in ring[1:]:
        total += x0 * y1 - x1 * y0
        x0, y0 = x1, y1
    return total / 2.0


def _dedupe_ring(ring: Iterable[Sequence[float]]) -> list[tuple[float, float]]:
    cleaned: list[tuple[float, float]] = []
    for x, y in ring:
        point = (float(x), float(y))
        if not cleaned or cleaned[-1] != point:
            cleaned.append(point)
    if len(cleaned) >= 2 and cleaned[0] != cleaned[-1]:
        cleaned.append(cleaned[0])
    return cleaned


def _point_in_ring(point: tuple[float, float], ring: list[tuple[float, float]]) -> bool:
    x, y = point
    inside = False
    for index in range(len(ring) - 1):
        x1, y1 = ring[index]
        x2, y2 = ring[index + 1]
        if (y1 > y) != (y2 > y):
            crossing = (x2 - x1) * (y - y1) / (y2 - y1) + x1
            if x < crossing:
                inside = not inside
    return inside


def rings_to_polygons(
    rings: Iterable[Sequence[Sequence[float]]],
) -> list[dict[str, object]]:
    """Assemble les anneaux d'un enregistrement Shapefile en polygones troués."""
    cleaned: list[tuple[list[tuple[float, float]], float]] = []
    for ring in rings:
        points = _dedupe_ring(ring)
        if len(points) < 4:
            continue
        area = _signed_area(points)
        if abs(area) < 1e-12:
            continue
        cleaned.append((points, area))
    if not cleaned:
        return []

    # Convention Shapefile : anneau extérieur horaire (aire négative), trou
    # antihoraire. On reste tolérant si le fichier ne la respecte pas.
    outer_rings = [(points, area) for points, area in cleaned if area < 0]
    hole_rings = [points for points, area in cleaned if area > 0]
    if not outer_rings:
        outer_rings = list(cleaned)
        hole_rings = []

    polygons: list[dict[str, object]] = []
    for points, area in outer_rings:
        polygons.append({"shell": points, "holes": [], "area": abs(area)})
    for hole in hole_rings:
        owner: dict[str, object] | None = None
        for polygon in polygons:
            shell = polygon["shell"]
            assert isinstance(shell, list)
            if _point_in_ring(hole[0], shell):
                if owner is None or float(polygon["area"]) < float(owner["area"]):  # type: ignore[arg-type]
                    owner = polygon
        if owner is None:
            polygons.append({"shell": hole, "holes": [], "area": abs(_signed_area(hole))})
        else:
            holes = owner["holes"]
            assert isinstance(holes, list)
            holes.append(hole)
    return polygons


def _douglas_peucker(ring: list[tuple[float, float]], tolerance: float) -> list[tuple[float, float]]:
    """Douglas-Peucker itératif (pas de récursion : anneaux très longs)."""
    points = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else list(ring)
    count = len(points)
    if count < 4:
        return _dedupe_ring(ring)

    keep = [False] * count
    keep[0] = keep[-1] = True
    tolerance_squared = tolerance * tolerance
    stack: list[tuple[int, int]] = [(0, count - 1)]
    while stack:
        start, end = stack.pop()
        if end <= start + 1:
            continue
        x1, y1 = points[start]
        x2, y2 = points[end]
        dx, dy = x2 - x1, y2 - y1
        segment_squared = dx * dx + dy * dy
        farthest = -1.0
        farthest_index = -1
        for index in range(start + 1, end):
            px, py = points[index]
            if segment_squared == 0.0:
                distance = (px - x1) ** 2 + (py - y1) ** 2
            else:
                ratio = ((px - x1) * dx + (py - y1) * dy) / segment_squared
                ratio = 0.0 if ratio < 0.0 else (1.0 if ratio > 1.0 else ratio)
                distance = (px - (x1 + ratio * dx)) ** 2 + (py - (y1 + ratio * dy)) ** 2
            if distance > farthest:
                farthest = distance
                farthest_index = index
        if farthest > tolerance_squared and farthest_index > 0:
            keep[farthest_index] = True
            stack.append((start, farthest_index))
            stack.append((farthest_index, end))

    kept = [points[index] for index in range(count) if keep[index]]
    if len(kept) < 3:
        return _dedupe_ring(ring)
    if kept[0] != kept[-1]:
        kept.append(kept[0])
    return kept


def _shapely_polygons(geometry: object) -> list[list[list[tuple[float, float]]]]:
    """Convertit une géométrie shapely en liste de polygones (anneaux de points)."""
    if geometry is None or geometry.is_empty:  # type: ignore[attr-defined]
        return []
    geometry_type = geometry.geom_type  # type: ignore[attr-defined]
    if geometry_type == "Polygon":
        polygon = geometry  # type: ignore[assignment]
        rings: list[list[tuple[float, float]]] = [
            [(float(x), float(y)) for x, y in polygon.exterior.coords]  # type: ignore[attr-defined]
        ]
        for interior in polygon.interiors:  # type: ignore[attr-defined]
            rings.append([(float(x), float(y)) for x, y in interior.coords])
        return [rings]
    if geometry_type == "MultiPolygon":
        polygons: list[list[list[tuple[float, float]]]] = []
        for part in geometry.geoms:  # type: ignore[attr-defined]
            polygons.extend(_shapely_polygons(part))
        return polygons
    if geometry_type == "GeometryCollection":
        polygons = []
        for part in geometry.geoms:  # type: ignore[attr-defined]
            polygons.extend(_shapely_polygons(part))
        return polygons
    return []


def _fallback_simplify(
    polygons: list[dict[str, object]], tolerance: float
) -> list[list[list[tuple[float, float]]]]:
    """Simplification Douglas-Peucker anneau par anneau (sans shapely)."""
    result: list[list[list[tuple[float, float]]]] = []
    for polygon in polygons:
        shell = _douglas_peucker(list(polygon["shell"]), tolerance)  # type: ignore[arg-type]
        if len(shell) < 4:
            continue
        rings = [shell]
        for hole in polygon["holes"]:  # type: ignore[index]
            simplified = _douglas_peucker(hole, tolerance)
            if len(simplified) >= 4:
                rings.append(simplified)
        result.append(rings)
    return result


def _round_ring(
    ring: Iterable[Sequence[float]], digits: int
) -> list[tuple[float, float]]:
    rounded: list[tuple[float, float]] = []
    for x, y in ring:
        point = (round(float(x), digits), round(float(y), digits))
        if not rounded or rounded[-1] != point:
            rounded.append(point)
    if len(rounded) >= 2 and rounded[0] != rounded[-1]:
        rounded.append(rounded[0])
    return rounded


def build_polygon_geometry(
    polygons: list[dict[str, object]], tolerance: float, digits: int
) -> dict[str, object] | None:
    """Construit une géométrie GeoJSON Polygon/MultiPolygon simplifiée et arrondie."""
    if not polygons:
        return None

    shapely_failed = False
    simplified: list[list[list[tuple[float, float]]]] = []
    if shapely is not None:
        assert Polygon is not None and MultiPolygon is not None
        try:
            parts = [
                Polygon(list(polygon["shell"]), [list(hole) for hole in polygon["holes"]])  # type: ignore[arg-type]
                for polygon in polygons
            ]
            merged = parts[0] if len(parts) == 1 else MultiPolygon(parts)
            simplified = _shapely_polygons(merged.simplify(tolerance, preserve_topology=True))
        except Exception:  # géométrie source invalide : repli Douglas-Peucker
            shapely_failed = True
    if shapely is None or shapely_failed:
        simplified = _fallback_simplify(polygons, tolerance)

    coordinates: list[list[list[list[float]]]] = []
    for polygon in simplified:
        rings: list[list[list[float]]] = []
        for ring in polygon:
            rounded = _round_ring(ring, digits)
            if len(rounded) >= 4:
                rings.append([[x, y] for x, y in rounded])
        if rings:
            coordinates.append(rings)
    if not coordinates:
        return None
    if len(coordinates) == 1:
        return {"type": "Polygon", "coordinates": coordinates[0]}
    return {"type": "MultiPolygon", "coordinates": coordinates}


def geometry_area_deg2(geometry: dict[str, object]) -> float:
    """Aire approximative (degrés² pondérés par la latitude) pour le classement."""
    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, list):
        return 0.0
    polygons = coordinates if geometry.get("type") == "MultiPolygon" else [coordinates]
    total = 0.0
    latitude_sum = 0.0
    latitude_count = 0
    for polygon in polygons:
        if not isinstance(polygon, list) or not polygon:
            continue
        shell = polygon[0]
        if not isinstance(shell, list):
            continue
        area = abs(_signed_area(shell))
        for hole in polygon[1:]:
            if isinstance(hole, list):
                area -= abs(_signed_area(hole))
        total += max(area, 0.0)
        if shell:
            latitude_sum += float(shell[0][1])
            latitude_count += 1
    latitude = latitude_sum / latitude_count if latitude_count else 0.0
    return total * max(math.cos(math.radians(latitude)), 0.05)


# ---------------------------------------------------------------------------
# Sources GeoNames
# ---------------------------------------------------------------------------


def read_admin1_names(path: Path) -> dict[str, str]:
    """Code admin-1 GeoNames (``FR.11``) -> nom lisible."""
    names: dict[str, str] = {}
    with open(path, "r", encoding="utf-8-sig") as handle:
        for line in handle:
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 2 and parts[0].strip():
                names[parts[0].strip()] = parts[1].strip()
    return names


def read_country_info(path: Path) -> tuple[dict[str, str], dict[str, list[str]]]:
    """ISO2 -> nom du pays, et ISO2 -> capitales déclarées (plusieurs possibles)."""
    names: dict[str, str] = {}
    capitals: dict[str, list[str]] = {}
    with open(path, "r", encoding="utf-8-sig") as handle:
        for line in handle:
            line = line.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) < 6:
                continue
            iso = parts[0].strip().upper()
            if not iso:
                continue
            names[iso] = parts[4].strip() or iso
            capitals[iso] = [part.strip() for part in parts[5].split(",") if part.strip()]
    return names, capitals


def iter_cities(cities_zip: Path) -> Iterator[list[str]]:
    with zipfile.ZipFile(cities_zip) as archive:
        member = next(
            (name for name in archive.namelist() if name.endswith(".txt")), None
        )
        if member is None:
            raise BuildError(f"{cities_zip.name}: aucun fichier .txt")
        with archive.open(member) as raw:
            with io.TextIOWrapper(raw, encoding="utf-8", errors="replace", newline="") as handle:
                for line in handle:
                    fields = line.rstrip("\n").split("\t")
                    if len(fields) >= 19:
                        yield fields


def normalize_name(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_only = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return "".join(ch for ch in ascii_only.casefold() if ch.isalnum())


def capital_variants(raw: str) -> set[str]:
    """Variantes comparables d'un nom de capitale (« St. » ⇄ « Saint »)."""
    variants = {normalize_name(raw)}
    abbreviated = re.match(r"^st\.?\s+(.+)$", raw, re.IGNORECASE)
    if abbreviated:
        variants.add(normalize_name("Saint " + abbreviated.group(1)))
    expanded = re.match(r"^saint\s+(.+)$", raw, re.IGNORECASE)
    if expanded:
        variants.add(normalize_name("St. " + expanded.group(1)))
    return variants


def _match_capital_place(
    records: dict[tuple[str, float, float], list[object]],
    candidate_keys: Sequence[tuple[str, float, float]],
    variants: set[str],
) -> tuple[str, float, float] | None:
    """Lieu le plus peuplé du pays dont le nom (ou l'exonyme ASCII) correspond."""
    best_key = None
    best_population = -1
    for key in candidate_keys:
        row = records[key]
        if (
            normalize_name(str(row[0])) in variants
            or normalize_name(str(row[8])) in variants
        ):
            population = int(row[3])
            if population > best_population:
                best_population = population
                best_key = key
    return best_key


def _flag_capitals(
    records: dict[tuple[str, float, float], list[object]],
    by_iso: dict[str, list[tuple[str, float, float]]],
    capital_names: dict[str, list[str]],
    cities_zip: Path,
) -> tuple[int, dict[str, list[str]]]:
    """Marque le meilleur lieu correspondant à chaque capitale déclarée.

    Trois passes, de la plus fiable à la plus permissive :
    1. nom / nom ASCII du lieu ;
    2. noms alternatifs GeoNames (ex. « Nur-Sultan » → Astana, « Macao » → Macau) ;
    3. nom de la région admin-1 homonyme, si un seul lieu y figure (ex. Palau).

    Retourne (nombre de capitales marquées, capitales sans lieu trouvé).
    """
    matched: dict[str, set[str]] = {}
    unmatched: dict[str, list[str]] = {}

    for iso, raw_names in sorted(capital_names.items()):
        candidate_keys = by_iso.get(iso, [])
        for raw in raw_names:
            key = _match_capital_place(records, candidate_keys, capital_variants(raw))
            if key is None:
                unmatched.setdefault(iso, []).append(raw)
            else:
                records[key][7] = True
                matched.setdefault(iso, set()).add(raw)

    if unmatched:
        pending = {
            iso: [(raw, capital_variants(raw)) for raw in raws]
            for iso, raws in unmatched.items()
        }
        best_match: dict[tuple[str, str], tuple[int, tuple[str, float, float]]] = {}
        for fields in iter_cities(cities_zip):
            iso = fields[8].strip().upper()
            if iso not in pending:
                continue
            name = fields[1].strip()
            try:
                latitude = round(float(fields[4]), 4)
                longitude = round(float(fields[5]), 4)
            except ValueError:
                continue
            key = (name, round(latitude, 2), round(longitude, 2))
            row = records.get(key)
            if row is None:
                continue
            variants = {normalize_name(name), normalize_name(fields[2])}
            for alternate in fields[3].split(","):
                alternate = alternate.strip()
                if alternate:
                    variants.add(normalize_name(alternate))
            for raw, raw_variants in pending[iso]:
                if variants & raw_variants:
                    population = int(row[3])
                    current = best_match.get((iso, raw))
                    if current is None or population > current[0]:
                        best_match[(iso, raw)] = (population, key)
        for (iso, raw), (_population, key) in best_match.items():
            records[key][7] = True
            matched.setdefault(iso, set()).add(raw)
        unmatched = {
            iso: [raw for raw in raws if raw not in matched.get(iso, set())]
            for iso, raws in unmatched.items()
        }
        unmatched = {iso: raws for iso, raws in unmatched.items() if raws}

    if unmatched:
        for iso, raws in list(unmatched.items()):
            candidate_keys = by_iso.get(iso, [])
            for raw in list(raws):
                target = normalize_name(raw)
                candidates = [
                    key
                    for key in candidate_keys
                    if normalize_name(str(records[key][6])) == target
                ]
                if len(candidates) != 1:
                    continue
                records[candidates[0]][7] = True
                matched.setdefault(iso, set()).add(raw)
                raws.remove(raw)
            if not raws:
                del unmatched[iso]

    return sum(len(values) for values in matched.values()), unmatched


# ---------------------------------------------------------------------------
# places.json
# ---------------------------------------------------------------------------


def _dumps(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _places_header() -> str:
    meta = {
        "version": PLACES_VERSION,
        "generated": build_date(),
        "attribution": PLACES_ATTRIBUTION,
        "fields": PLACES_FIELDS,
    }
    serialized = _dumps(meta)
    return serialized[:-1] + ',"places":['


def _place_sort_key(row: Sequence[object]) -> tuple[object, ...]:
    name = str(row[0])
    return (-int(row[3]), name.casefold(), name, str(row[4]), float(row[1]), float(row[2]))


def build_places(force: bool = False) -> None:
    cities_zip = download("cities15000", force)
    admin1_names = read_admin1_names(download("admin1_codes", force))
    country_names, capital_names = read_country_info(download("country_info", force))

    records: dict[tuple[str, float, float], list[object]] = {}
    source_rows = 0
    skipped = 0
    duplicates = 0
    unknown_admin1 = 0
    unknown_country = 0

    for fields in iter_cities(cities_zip):
        source_rows += 1
        feature_class = fields[7].strip()
        if not feature_class.startswith("PPL"):
            skipped += 1
            continue
        name = fields[1].strip()
        if not name:
            skipped += 1
            continue
        try:
            latitude = round(float(fields[4]), 4)
            longitude = round(float(fields[5]), 4)
            population = int(fields[14]) if fields[14].strip().isdigit() else 0
        except ValueError:
            skipped += 1
            continue
        if not (math.isfinite(latitude) and math.isfinite(longitude)):
            skipped += 1
            continue
        if not (-90.0 <= latitude <= 90.0 and -180.0 <= longitude <= 180.0):
            skipped += 1
            continue

        iso = fields[8].strip().upper()
        admin1_code = fields[10].strip()
        admin1 = admin1_names.get(f"{iso}.{admin1_code}", "").strip()
        if admin1_code and not admin1:
            unknown_admin1 += 1
        country = country_names.get(iso)
        if country is None:
            unknown_country += 1
            country = iso
        country = COUNTRY_DISPLAY_NAMES.get(iso, country)

        key = (name, round(latitude, 2), round(longitude, 2))
        existing = records.get(key)
        if existing is None:
            # 9e champ temporaire : nom ASCII, utilisé pour repérer les capitales.
            records[key] = [
                name,
                latitude,
                longitude,
                population,
                iso,
                country,
                admin1,
                False,
                fields[2].strip(),
            ]
        else:
            duplicates += 1
            existing[3] = max(int(existing[3]), population)

    if not records:
        raise BuildError("places: aucune ligne exploitable dans cities15000")

    by_iso: dict[str, list[tuple[str, float, float]]] = {}
    for key, row in records.items():
        by_iso.setdefault(str(row[4]), []).append(key)

    declared_capitals = sum(len(values) for values in capital_names.values())
    matched_capitals, unmatched_capitals = _flag_capitals(
        records, by_iso, capital_names, cities_zip
    )

    rows: list[list[object]] = [row[:8] for row in records.values()]
    header = _places_header()
    bytes_per_row = [len(_dumps(row).encode("utf-8")) for row in rows]
    total = len(header.encode("utf-8")) + len(b"]}") + sum(bytes_per_row) + len(rows) - 1

    dropped = 0
    if total > MAX_PLACES_BYTES:
        # Budget dépassé : on conserve en priorité les capitales puis les plus
        # grandes populations, et on retire les lignes de plus faible poids.
        ordered = sorted(
            rows,
            key=lambda row: (
                0 if row[7] else 1,
                -int(row[3]),
                str(row[0]).casefold(),
                str(row[0]),
                str(row[4]),
                float(row[1]),
                float(row[2]),
            ),
        )
        lengths = [len(_dumps(row).encode("utf-8")) for row in ordered]
        total = len(header.encode("utf-8")) + len(b"]}") + sum(lengths) + (len(ordered) - 1)
        while ordered and total > MAX_PLACES_BYTES:
            removed = ordered.pop()
            total -= lengths.pop() + 1
            if removed[7]:
                raise BuildError(
                    "places: le budget de 2,8 Mo ne permet même pas de conserver les capitales"
                )
            dropped += 1
        rows = ordered

    rows.sort(key=_place_sort_key)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(PLACES_PATH, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(header)
        if rows:
            handle.write(_dumps(rows[0]))
            for row in rows[1:]:
                handle.write(",")
                handle.write(_dumps(row))
        handle.write("]}")

    size = PLACES_PATH.stat().st_size
    if size > MAX_PLACES_BYTES:
        raise BuildError(f"places.json: {size} octets > {MAX_PLACES_BYTES} octets")
    capitals = sum(1 for row in rows if row[7])
    info(
        f"[places]   {source_rows} lignes source → {len(rows)} lieux "
        f"({capitals} communes capitales sur {declared_capitals} déclarées, "
        f"{duplicates} doublons fusionnés, {skipped} lignes écartées, "
        f"{dropped} tronquées) — {human_bytes(size)}"
    )
    if unmatched_capitals:
        detail = "; ".join(
            f"{iso}: {', '.join(raws)}" for iso, raws in sorted(unmatched_capitals.items())
        )
        info(f"[places]   capitales sans lieu correspondant: {detail}")
    if unknown_admin1:
        info(f"[places]   {unknown_admin1} codes admin-1 absents de admin1CodesASCII")
    if unknown_country:
        info(f"[places]   {unknown_country} codes pays absents de countryInfo")


# ---------------------------------------------------------------------------
# countries.geojson
# ---------------------------------------------------------------------------


def resolve_country_iso(record: dict[str, str]) -> str:
    for key in ("ISO_A2", "ISO_A2_EH", "WB_A2"):
        value = (record.get(key) or "").strip().upper()
        if len(value) == 2 and value.isalpha():
            return value
    return "-99"


def dbf_value(record: dict[str, str] | None, *names: str) -> str:
    """Lit un attribut DBF sans dépendre de la casse des noms de champs.

    Natural Earth publie les mêmes attributs en plusieurs langues
    (``NAME``, ``NAME_FR``…). Le globe affiche les noms français quand ils
    existent, sinon le nom anglais fourni par la source.
    """
    if not record:
        return ""
    folded = {str(key).casefold(): value for key, value in record.items()}
    for name in names:
        value = folded.get(name.casefold())
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def read_admin0_features(shp: Path, dbf: Path) -> list[dict[str, object]]:
    shapes = list(iter_shp_geometries(shp))
    records = list(iter_dbf_records(dbf))
    if len(shapes) != len(records):
        raise BuildError(
            f"{shp.name}: {len(shapes)} formes mais {len(records)} attributs DBF"
        )
    features: list[dict[str, object]] = []
    missing_iso: list[str] = []
    fallback_iso = 0
    for rings, record in zip(shapes, records):
        if record is None or not rings:
            continue
        name = dbf_value(record, "NAME_FR", "NAME", "NAME_EN", "ADMIN")
        if not name:
            continue
        iso = resolve_country_iso(record)
        if iso == "-99":
            missing_iso.append(name)
        elif (record.get("ISO_A2") or "").strip().upper() != iso:
            fallback_iso += 1
        geometry = build_polygon_geometry(
            rings_to_polygons(rings), COUNTRY_SIMPLIFY_DEG, COUNTRY_ROUND_DIGITS
        )
        if geometry is None:
            continue
        features.append(
            {
                "type": "Feature",
                "properties": {"name": name, "iso_a2": iso},
                "geometry": geometry,
            }
        )
    if missing_iso:
        info(f"[countries] sans code ISO A2: {', '.join(sorted(missing_iso))}")
    if fallback_iso:
        info(f"[countries] {fallback_iso} codes ISO_A2 récupérés via ISO_A2_EH/WB_A2")
    return features


def build_countries(force: bool = False) -> None:
    zip_path = download("ne_admin0_countries", force)
    shp, dbf = ensure_shapefile(zip_path, "ne_110m_admin_0_countries")
    features = read_admin0_features(shp, dbf)
    if not features:
        raise BuildError("countries: aucune géométrie exploitable")
    features.sort(key=lambda feature: (str(feature["properties"]["name"]).casefold(),))  # type: ignore[index]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    write_feature_collection(COUNTRIES_PATH, (feature for feature in features))
    size = COUNTRIES_PATH.stat().st_size
    if size > MAX_COUNTRIES_BYTES:
        raise BuildError(f"countries.geojson: {size} octets > {MAX_COUNTRIES_BYTES}")
    info(f"[countries] {len(features)} pays — {human_bytes(size)}")


def write_feature_collection(path: Path, features: Iterable[dict[str, object]]) -> None:
    with open(path, "wb") as handle:
        handle.write(b'{"type":"FeatureCollection","features":[')
        first = True
        for feature in features:
            if not first:
                handle.write(b",")
            handle.write(_dumps(feature).encode("utf-8"))
            first = False
        handle.write(b"]}")


# ---------------------------------------------------------------------------
# admin1.geojson
# ---------------------------------------------------------------------------


def admin1_source_stats(dbf: Path) -> tuple[int, int]:
    features = 0
    countries: set[str] = set()
    for record in iter_dbf_records(dbf):
        if record is None:
            continue
        country = (record.get("admin") or record.get("adm0name") or "").strip()
        if not country:
            continue
        features += 1
        countries.add(country)
    return features, len(countries)


def choose_admin1_source(force: bool) -> tuple[str, str, Path, Path, int, int]:
    """Choisit la première source admin-1 polygonale couvrant ≥ 400 entités/25 pays."""
    best: tuple[str, str, Path, Path, int, int] | None = None
    failures: list[str] = []
    for key, stem, label in ADMIN1_CANDIDATES:
        try:
            zip_path = download(key, force)
            shp, dbf = ensure_shapefile(zip_path, stem)
            shp_count = count_shp_records(shp)
            dbf_count = count_dbf_records(dbf)
            if shp_count != dbf_count:
                raise BuildError(
                    f"{shp.name}: {shp_count} formes mais {dbf_count} attributs DBF"
                )
            features, countries = admin1_source_stats(dbf)
        except BuildError as exc:
            failures.append(f"{label}: {exc}")
            info(f"[admin1]    source indisponible — {label} ({exc})")
            continue
        info(f"[admin1]    {label}: {features} entités, {countries} pays")
        candidate = (key, label, shp, dbf, features, countries)
        if features >= ADMIN1_MIN_FEATURES and countries >= ADMIN1_MIN_COUNTRIES:
            return candidate
        if best is None or features > best[4]:
            best = candidate
    if best is None:
        raise BuildError(
            "admin-1: aucune source exploitable. " + " | ".join(failures)
        )
    info(
        "[admin1]    repli sur la source la plus fournie "
        f"({best[4]} entités, {best[5]} pays) : seuils de couverture non atteints"
    )
    return best


def read_admin1_features(
    shp: Path, dbf: Path, tolerance: float
) -> list[dict[str, object]]:
    features: list[dict[str, object]] = []
    skipped = 0
    shp_records = iter_shp_geometries(shp)
    dbf_records = iter_dbf_records(dbf)
    for rings, record in zip(shp_records, dbf_records):
        if record is None or not rings:
            skipped += 1
            continue
        name = dbf_value(record, "name_fr", "name", "name_en", "gn_name")
        country = dbf_value(record, "admin", "adm0name", "geonunit")
        if not name or not country:
            skipped += 1
            continue
        iso = (record.get("iso_a2") or "").strip().upper()
        country = COUNTRY_DISPLAY_NAMES.get(iso, country)
        geometry = build_polygon_geometry(
            rings_to_polygons(rings), tolerance, ADMIN1_ROUND_DIGITS
        )
        if geometry is None:
            skipped += 1
            continue
        features.append(
            {
                "idx": len(features),
                "name": name,
                "country": country,
                "area": geometry_area_deg2(geometry),
                "payload": _dumps(
                    {
                        "type": "Feature",
                        "properties": {"name": name, "country": country},
                        "geometry": geometry,
                    }
                ).encode("utf-8"),
            }
        )
    if skipped:
        info(f"[admin1]    {skipped} entités ignorées (géométrie ou nom vide)")
    return features


def select_admin1(
    features: list[dict[str, object]], budget: int = MAX_ADMIN1_BYTES
) -> tuple[list[dict[str, object]], int, int]:
    """Garde les plus grandes entités jusqu'au budget, avec couverture minimale.

    Retourne (entités retenues, octets estimés du fichier, nombre écarté).
    """
    prefix_size = len(b'{"type":"FeatureCollection","features":[')
    suffix_size = len(b"]}")
    total_all = (
        prefix_size
        + suffix_size
        + sum(len(feature["payload"]) for feature in features)  # type: ignore[arg-type]
        + max(0, len(features) - 1)
    )
    if total_all <= budget:
        return list(features), total_all, 0

    ordered = sorted(
        features,
        key=lambda feature: (
            -float(feature["area"]),  # type: ignore[arg-type]
            str(feature["country"]),
            str(feature["name"]),
        ),
    )
    selected: list[dict[str, object]] = []
    selected_ids: set[int] = set()
    used = prefix_size + suffix_size
    for feature in ordered:
        cost = len(feature["payload"]) + (1 if selected else 0)  # type: ignore[arg-type]
        if used + cost > budget:
            continue
        used += cost
        selected.append(feature)
        selected_ids.add(int(feature["idx"]))

    # Couverture minimale : au moins un pays représenté pour chaque pays absent.
    present = {str(feature["country"]) for feature in selected}
    if len(present) < ADMIN1_MIN_COUNTRIES:
        for feature in ordered:
            if str(feature["country"]) in present:
                continue
            cost = len(feature["payload"]) + 1  # type: ignore[arg-type]
            if used + cost > budget:
                continue
            used += cost
            selected.append(feature)
            selected_ids.add(int(feature["idx"]))
            present.add(str(feature["country"]))
            if len(present) >= ADMIN1_MIN_COUNTRIES:
                break

    selected.sort(key=lambda feature: (str(feature["country"]).casefold(), str(feature["name"]).casefold()))
    dropped = len(features) - len(selected)
    return selected, used, dropped


def build_admin1(force: bool = False) -> None:
    key, label, shp, dbf, source_features, source_countries = choose_admin1_source(force)
    info(
        f"[admin1]    source retenue: {label} ({source_features} entités, "
        f"{source_countries} pays)"
    )

    tolerance = ADMIN1_SIMPLIFY_DEG
    selected: list[dict[str, object]] = []
    used = 0
    dropped = 0
    for _ in range(4):
        features = read_admin1_features(shp, dbf, tolerance)
        selected, used, dropped = select_admin1(features, MAX_ADMIN1_BYTES)
        countries = len({str(feature["country"]) for feature in selected})
        info(
            f"[admin1]    simplification {tolerance:g}° → {len(selected)} entités / "
            f"{countries} pays retenus (~{human_bytes(used)}), {dropped} écartées"
        )
        if len(selected) >= ADMIN1_MIN_FEATURES and countries >= ADMIN1_MIN_COUNTRIES:
            break
        tolerance *= 2
    else:
        info(
            "[admin1]    ATTENTION: seuil de 400 entités / 25 pays non atteint "
            "malgré une simplification accrue"
        )

    if not selected:
        raise BuildError("admin1: aucune entité à écrire")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(ADMIN1_PATH, "wb") as handle:
        handle.write(b'{"type":"FeatureCollection","features":[')
        for index, feature in enumerate(selected):
            if index:
                handle.write(b",")
            handle.write(feature["payload"])  # type: ignore[arg-type]
        handle.write(b"]}")

    size = ADMIN1_PATH.stat().st_size
    if size > MAX_ADMIN1_BYTES:
        raise BuildError(f"admin1.geojson: {size} octets > {MAX_ADMIN1_BYTES}")
    countries = len({str(feature["country"]) for feature in selected})
    info(
        f"[admin1]    {len(selected)} entités / {countries} pays — {human_bytes(size)}"
    )
    if dropped:
        info(
            f"[admin1]    {dropped} entités écartées faute de budget "
            f"(les plus grandes par aire sont conservées)"
        )


# ---------------------------------------------------------------------------
# Validation (--verify)
# ---------------------------------------------------------------------------


def _reject_constant(token: str) -> None:
    raise VerifyError(f"valeur non finie interdite dans le JSON: {token}")


def load_json_strict(path: Path) -> object:
    if not path.exists():
        raise VerifyError(f"{path}: fichier absent (lancer le build)")
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle, parse_constant=_reject_constant)
    except json.JSONDecodeError as exc:
        raise VerifyError(f"{path.name}: JSON invalide ({exc})") from exc
    except UnicodeDecodeError as exc:
        raise VerifyError(f"{path.name}: encodage UTF-8 invalide ({exc})") from exc


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _iter_rings(geometry: dict[str, object]) -> Iterator[list[object]]:
    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, list):
        return
    geometry_type = geometry.get("type")
    if geometry_type == "Polygon":
        for ring in coordinates:
            if isinstance(ring, list):
                yield ring
    elif geometry_type == "MultiPolygon":
        for polygon in coordinates:
            if isinstance(polygon, list):
                for ring in polygon:
                    if isinstance(ring, list):
                        yield ring


def validate_geometry(geometry: object, label: str) -> None:
    if not isinstance(geometry, dict):
        raise VerifyError(f"{label}: géométrie absente")
    geometry_type = geometry.get("type")
    if geometry_type not in ("Polygon", "MultiPolygon"):
        raise VerifyError(f"{label}: type de géométrie {geometry_type!r} interdit")
    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, list) or not coordinates:
        raise VerifyError(f"{label}: coordonnées vides")

    positions = 0
    for ring in _iter_rings(geometry):
        if len(ring) < 4:
            raise VerifyError(f"{label}: anneau de {len(ring)} points (< 4)")
        first = ring[0]
        last = ring[-1]
        if not (isinstance(first, list) and isinstance(last, list) and first[:2] == last[:2]):
            raise VerifyError(f"{label}: anneau non fermé")
        for point in ring:
            if not isinstance(point, list) or len(point) < 2:
                raise VerifyError(f"{label}: position malformée")
            longitude, latitude = point[0], point[1]
            if not _is_number(longitude) or not _is_number(latitude):
                raise VerifyError(f"{label}: coordonnée non numérique")
            if not (math.isfinite(float(longitude)) and math.isfinite(float(latitude))):
                raise VerifyError(f"{label}: coordonnée non finie")
            if not -180.0 <= float(longitude) <= 180.0:
                raise VerifyError(f"{label}: longitude hors bornes ({longitude})")
            if not -90.0 <= float(latitude) <= 90.0:
                raise VerifyError(f"{label}: latitude hors bornes ({latitude})")
            positions += 1
    if positions == 0:
        raise VerifyError(f"{label}: aucune coordonnée")


def validate_feature_collection(
    path: Path, maximum: int, property_keys: set[str]
) -> tuple[int, int, int]:
    """Valide un GeoJSON ; retourne (nombre d'entités, pays distincts, octets)."""
    size = path.stat().st_size if path.exists() else 0
    if size == 0:
        raise VerifyError(f"{path.name}: fichier absent ou vide")
    if size > maximum:
        raise VerifyError(
            f"{path.name}: {human_bytes(size)} > plafond {human_bytes(maximum)}"
        )
    payload = load_json_strict(path)
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
        raise VerifyError(f"{path.name}: ce n'est pas une FeatureCollection")
    features = payload.get("features")
    if not isinstance(features, list) or not features:
        raise VerifyError(f"{path.name}: aucune entité")
    countries: set[str] = set()
    for index, feature in enumerate(features):
        label = f"{path.name}[{index}]"
        if not isinstance(feature, dict):
            raise VerifyError(f"{label}: entité malformée")
        if feature.get("type") != "Feature":
            raise VerifyError(f"{label}: type {feature.get('type')!r} inattendu")
        properties = feature.get("properties")
        if not isinstance(properties, dict):
            raise VerifyError(f"{label}: propriétés absentes")
        if set(properties) != property_keys:
            raise VerifyError(
                f"{label}: propriétés {sorted(properties)} != {sorted(property_keys)}"
            )
        for key, value in properties.items():
            if not isinstance(value, str) or not value.strip():
                raise VerifyError(f"{label}: propriété {key!r} vide ou non textuelle")
        validate_geometry(feature.get("geometry"), label)
        country = properties.get("country")
        if isinstance(country, str):
            countries.add(country)
    return len(features), len(countries), size


def validate_places() -> tuple[int, int]:
    size = PLACES_PATH.stat().st_size if PLACES_PATH.exists() else 0
    if size == 0:
        raise VerifyError("places.json: fichier absent ou vide")
    if size > MAX_PLACES_BYTES:
        raise VerifyError(
            f"places.json: {human_bytes(size)} > plafond {human_bytes(MAX_PLACES_BYTES)}"
        )
    payload = load_json_strict(PLACES_PATH)
    if not isinstance(payload, dict):
        raise VerifyError("places.json: racine non objet")
    if payload.get("version") != PLACES_VERSION:
        raise VerifyError(f"places.json: version {payload.get('version')!r} != 1")
    if payload.get("fields") != PLACES_FIELDS:
        raise VerifyError("places.json: liste 'fields' inattendue")
    if not isinstance(payload.get("attribution"), str) or not payload["attribution"]:
        raise VerifyError("places.json: attribution absente")
    if not isinstance(payload.get("generated"), str) or not payload["generated"]:
        raise VerifyError("places.json: date de génération absente")
    rows = payload.get("places")
    if not isinstance(rows, list) or not rows:
        raise VerifyError("places.json: aucune ligne")

    problems: list[str] = []
    capitals = 0
    for index, row in enumerate(rows):
        if len(problems) >= 20:
            break
        label = f"places.json[{index}]"
        if not isinstance(row, list) or len(row) != 8:
            problems.append(f"{label}: ligne de longueur {len(row) if isinstance(row, list) else '?'} (attendu 8)")
            continue
        name, latitude, longitude, population, iso, country, admin1, capital = row
        if not isinstance(name, str) or not name.strip():
            problems.append(f"{label}: nom vide")
        if not _is_number(latitude) or not -90.0 <= float(latitude) <= 90.0:
            problems.append(f"{label}: latitude invalide ({latitude!r})")
        if not _is_number(longitude) or not -180.0 <= float(longitude) <= 180.0:
            problems.append(f"{label}: longitude invalide ({longitude!r})")
        if not isinstance(population, int) or isinstance(population, bool) or population < 0:
            problems.append(f"{label}: population invalide ({population!r})")
        for key, value in (("country_code", iso), ("country", country), ("admin1", admin1)):
            if not isinstance(value, str):
                problems.append(f"{label}: {key} non textuel")
        if not isinstance(capital, bool):
            problems.append(f"{label}: capital non booléen")
        elif capital:
            capitals += 1
    if problems:
        raise VerifyError("places.json:\n  - " + "\n  - ".join(problems))
    return len(rows), capitals


def smoke_check_places() -> None:
    payload = load_json_strict(PLACES_PATH)
    assert isinstance(payload, dict)
    rows = payload.get("places")
    assert isinstance(rows, list)
    targets = ("Abidjan", "Paris", "Tokyo", "São Paulo")
    best: dict[str, list[object]] = {}
    for row in rows:
        if not isinstance(row, list) or len(row) != 8:
            continue
        name = row[0]
        if name in targets:
            current = best.get(str(name))
            if current is None or int(row[3]) > int(current[3]):
                best[str(name)] = row
    for target in targets:
        row = best.get(target)
        if row is None:
            raise VerifyError(f"smoke: {target} absent de places.json")
        info(
            f"[smoke]    {row[0]} — lat {row[1]}, lon {row[2]}, pop {row[3]}, "
            f"{row[4]} / {row[5]} / {row[6] or '—'}, capitale={row[7]}"
        )


def verify_outputs() -> int:
    info("")
    info("=== Validation des fichiers produits ===")
    failures: list[str] = []
    try:
        places, capitals = validate_places()
        size = PLACES_PATH.stat().st_size
        info(
            f"[verify]   places.json       {places} lieux ({capitals} capitales) — "
            f"{human_bytes(size)} ≤ {human_bytes(MAX_PLACES_BYTES)}  OK"
        )
        smoke_check_places()
    except VerifyError as exc:
        failures.append(str(exc))

    try:
        count, _iso, size = validate_feature_collection(
            COUNTRIES_PATH, MAX_COUNTRIES_BYTES, {"name", "iso_a2"}
        )
        info(
            f"[verify]   countries.geojson {count} pays — {human_bytes(size)} ≤ "
            f"{human_bytes(MAX_COUNTRIES_BYTES)}  OK"
        )
    except VerifyError as exc:
        failures.append(str(exc))

    try:
        count, countries, size = validate_feature_collection(
            ADMIN1_PATH, MAX_ADMIN1_BYTES, {"name", "country"}
        )
        if count < ADMIN1_MIN_FEATURES:
            failures.append(
                f"admin1.geojson: {count} entités < minimum {ADMIN1_MIN_FEATURES}"
            )
        if countries < ADMIN1_MIN_COUNTRIES:
            failures.append(
                f"admin1.geojson: {countries} pays < minimum {ADMIN1_MIN_COUNTRIES}"
            )
        info(
            f"[verify]   admin1.geojson    {count} entités / {countries} pays — "
            f"{human_bytes(size)} ≤ {human_bytes(MAX_ADMIN1_BYTES)}  "
            f"{'OK' if count >= ADMIN1_MIN_FEATURES and countries >= ADMIN1_MIN_COUNTRIES else 'FAIL'}"
        )
    except VerifyError as exc:
        failures.append(str(exc))

    if failures:
        info("")
        for failure in failures:
            info(f"[verify]   ÉCHEC: {failure}")
        info("[verify]   FAIL")
        return 1
    info("[verify]   PASS")
    return 0


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------


def build(force: bool = False) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    info(f"IntelliFlood — construction du jeu géographique")
    info(f"  cache      : {CACHE_DIR}")
    info(f"  sorties    : {OUT_DIR}")
    info(f"  shapely    : {'oui (' + shapely.__version__ + ')' if shapely else 'non — Douglas-Peucker pur Python'}")
    build_places(force=force)
    build_countries(force=force)
    build_admin1(force=force)


def main(argv: Sequence[str] | None = None) -> int:
    _configure_output()
    parser = argparse.ArgumentParser(
        description=(
            "Construit les données géographiques statiques du globe IntelliFlood "
            "(lieux GeoNames + frontières Natural Earth)."
        )
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="valide les fichiers déjà produits et affiche le rapport (sans rebuild)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="force le re-téléchargement de toutes les sources dans scripts/.geo-cache",
    )
    args = parser.parse_args(argv)

    if args.verify:
        return verify_outputs()

    try:
        build(force=args.force)
    except BuildError as exc:
        print(f"[erreur] {exc}", file=sys.stderr)
        return 2
    except (OSError, MemoryError) as exc:
        print(f"[erreur] {exc}", file=sys.stderr)
        return 2
    return verify_outputs()


if __name__ == "__main__":
    raise SystemExit(main())
