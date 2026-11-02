"""Modèle d'inondation simplifié sur modèle numérique de terrain (MNT).

IMPORTANT — limites : ce n'est PAS un modèle hydrodynamique. Deux approches indicatives :
  * « niveau »  : l'eau atteint une cote donnée à la source et envahit les cellules plus basses
                  CONNECTÉES à celle-ci (remplissage de cuvette, « bathtub » avec connectivité) ;
  * « pluie »   : un volume de pluie ruisselée se rassemble dans le point bas (bilan de volume).
L'écoulement dynamique, les ouvrages, le drainage et l'infiltration ne sont pas simulés.
Une incertitude verticale du MNT est propagée en fournissant une étendue « possible ».
"""

from dataclasses import dataclass

import numpy as np
from scipy import ndimage

STRUCT = np.ones((3, 3), dtype=bool)  # connectivité à 8 voisins


@dataclass(frozen=True)
class FloodResult:
    depth_m: np.ndarray  # profondeur centrale (m), 0 = sec
    possible: np.ndarray  # étendue possible (cote + erreur du MNT), bool
    surface_level_m: float  # cote de la surface de l'eau (m, même référence que le MNT)
    volume_m3: float
    area_km2: float
    max_depth_m: float


def _connected_depth(ground: np.ndarray, seed: tuple[int, int], level: float) -> np.ndarray:
    below = ground < level
    if not below[seed]:
        return np.zeros_like(ground)
    labels, _ = ndimage.label(below, structure=STRUCT)
    region = labels == labels[seed]
    return np.where(region, level - ground, 0.0)


def flood_from_level(ground: np.ndarray, seed: tuple[int, int], rise_m: float, cell_m: float, dem_error_m: float) -> FloodResult:
    """Eau montant de `rise_m` au-dessus du sol de la cellule source."""
    if rise_m < 0:
        raise ValueError("La montée de l'eau doit être positive.")
    level = float(ground[seed]) + rise_m
    depth = _connected_depth(ground, seed, level)
    possible = _connected_depth(ground, seed, level + dem_error_m) > 0
    return _result(depth, possible, level, cell_m)


def flood_from_rain(ground: np.ndarray, rain_mm_h: float, hours: float, runoff: float, cell_m: float, dem_error_m: float) -> FloodResult:
    """Volume ruisselé = pluie × durée × coefficient de ruissellement, rassemblé autour du point bas."""
    if not (0 <= runoff <= 1):
        raise ValueError("Le coefficient de ruissellement doit être entre 0 et 1.")
    area = ground.size * cell_m**2
    volume = rain_mm_h / 1000.0 * hours * area * runoff
    seed = np.unravel_index(int(np.argmin(ground)), ground.shape)
    if volume <= 0:
        return _result(np.zeros_like(ground), np.zeros(ground.shape, bool), float(ground[seed]), cell_m)

    def stored(level: float) -> float:
        return float(_connected_depth(ground, seed, level).sum() * cell_m**2)

    lo, hi = float(ground[seed]), float(ground.max()) + 50.0
    for _ in range(40):  # dichotomie sur la cote de la surface libre
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if stored(mid) < volume else (lo, mid)
    level = (lo + hi) / 2
    return _result(_connected_depth(ground, seed, level), _connected_depth(ground, seed, level + dem_error_m) > 0, level, cell_m)


def _result(depth: np.ndarray, possible: np.ndarray, level: float, cell_m: float) -> FloodResult:
    wet = depth > 0.005
    depth = np.where(wet, depth, 0.0)
    return FloodResult(depth, possible | wet, level, float(depth.sum() * cell_m**2),
                       float(wet.sum() * cell_m**2 / 1e6), float(depth.max()) if wet.any() else 0.0)
