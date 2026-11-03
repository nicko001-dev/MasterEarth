"""National Open-Meteo sampling grid for Côte d'Ivoire."""

import json
import math
from functools import lru_cache
from importlib.resources import files

from shapely.geometry import Point, shape
from shapely.geometry.base import BaseGeometry

GRID_SPACING_KM = 50
_KM_PER_LATITUDE_DEGREE = 111.32


@lru_cache(maxsize=1)
def _boundary() -> BaseGeometry:
    geojson = json.loads(
        files("app")
        .joinpath("data", "ivory_coast_boundary.geojson")
        .read_text(encoding="utf-8")
    )
    boundary = shape(geojson["geometry"])
    if boundary.is_empty or not boundary.is_valid:
        raise ValueError("La frontière météo de la Côte d'Ivoire est invalide.")
    return boundary


@lru_cache(maxsize=1)
def national_grid_points() -> tuple[tuple[str, float, float], ...]:
    """Return rounded grid points covered by the Natural Earth country boundary."""
    boundary = _boundary()
    west, south, east, north = boundary.bounds
    latitude_step = GRID_SPACING_KM / _KM_PER_LATITUDE_DEGREE
    midpoint_latitude = (south + north) / 2
    longitude_step = GRID_SPACING_KM / (
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
                        f"Maillage 50 km ({latitude:.2f}, {longitude:.2f})",
                        latitude,
                        longitude,
                    )
                )
    return tuple(points)
