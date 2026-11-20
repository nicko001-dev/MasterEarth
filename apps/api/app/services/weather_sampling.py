"""Points de sondage météo : réseau déployé et vue mondiale à la demande.

Deux jeux de points coexistent, et il ne faut pas les confondre :

- les points **ancrés** (espacés de :data:`SAMPLE_SPACING_KM`) couvrent la zone où
  le réseau de capteurs est réellement déployé. Ils sont collectés
  périodiquement par ``app.services.weather`` et écrits en base : ce sont les
  seuls points historisés ;
- les points **mondiaux** sont calculés **à la demande** pour l'emprise visible
  de la carte, par ``app.services.weather_viewport``. Ils couvrent n'importe
  quelle région du globe sans jamais stocker un jeu planétaire (50 km sur le
  globe représenteraient environ 260 000 points, au-delà de tout quota).

Il ne s'agit que de points isolés, jamais d'une trame de fond : aucun réseau de
lignes ni découpage en cellules n'est produit ou rendu. La frontière utilisée
pour les points ancrés provient de Natural Earth et décrit la zone du réseau
déployé ; elle ne limite en rien la portée de la plateforme.
"""

import json
import math
from functools import lru_cache
from importlib.resources import files

from shapely.geometry import Point, shape
from shapely.geometry.base import BaseGeometry

SAMPLE_SPACING_KM = 50
ANCHORED_REGION_NAME = "Côte d'Ivoire (réseau déployé)"
ANCHORED_BOUNDARY_RESOURCE = ("data", "ivory_coast_boundary.geojson")
_KM_PER_LATITUDE_DEGREE = 111.32


@lru_cache(maxsize=1)
def anchored_boundary() -> BaseGeometry:
    """Frontière de la zone du réseau déployé (Natural Earth, domaine public)."""
    geojson = json.loads(
        files("app")
        .joinpath(*ANCHORED_BOUNDARY_RESOURCE)
        .read_text(encoding="utf-8")
    )
    boundary = shape(geojson["geometry"])
    if boundary.is_empty or not boundary.is_valid:
        raise ValueError("La frontière des points ancrés est invalide.")
    return boundary


@lru_cache(maxsize=1)
def anchored_sample_points() -> tuple[tuple[str, float, float], ...]:
    """Points de sondage ancrés couverts par la frontière du réseau déployé."""
    boundary = anchored_boundary()
    west, south, east, north = boundary.bounds
    latitude_step = SAMPLE_SPACING_KM / _KM_PER_LATITUDE_DEGREE
    midpoint_latitude = (south + north) / 2
    longitude_step = SAMPLE_SPACING_KM / (
        _KM_PER_LATITUDE_DEGREE * math.cos(math.radians(midpoint_latitude))
    )

    points = []
    for latitude_index in range(
        math.ceil(south / latitude_step), math.floor(north / latitude_step) + 1
    ):
        latitude = round(latitude_index * latitude_step, 3)
        for longitude_index in range(
            math.ceil(west / longitude_step), math.floor(east / longitude_step) + 1
        ):
            longitude = round(longitude_index * longitude_step, 3)
            if boundary.covers(Point(longitude, latitude)):
                points.append(
                    (
                        f"Sondage {SAMPLE_SPACING_KM} km ({latitude:.2f}, {longitude:.2f})",
                        latitude,
                        longitude,
                    )
                )
    return tuple(points)


def anchored_status() -> dict:
    """Description des points ancrés, destinée au contrat ``/weather/status``."""
    return {
        "region": ANCHORED_REGION_NAME,
        "spacing_km": SAMPLE_SPACING_KM,
        "points": len(anchored_sample_points()),
        "role": "collecte périodique historisée du réseau déployé",
    }
