"""Moteur d'alerte pur (sans base de données, sans FastAPI).

Règles issues du système BOATIKS : filtrage médian de plusieurs relevés,
classification en niveaux Vert/Orange/Rouge et règle de persistance
(plusieurs cycles consécutifs avant de déclencher une alerte).
Les seuils sont configurables : leurs valeurs par défaut sont PROVISOIRES
et doivent être validées opérationnellement (décision « À DÉFINIR »).
"""

import math
from dataclasses import dataclass
from statistics import median

LEVELS = ("green", "orange", "red")
_RANK = {name: i for i, name in enumerate(LEVELS)}


@dataclass(frozen=True)
class Thresholds:
    orange_cm: float = 40.0
    red_cm: float = 80.0
    orange_rise_cm_min: float = 5.0
    red_rise_cm_min: float = 10.0
    persistence_cycles: int = 3


def median_distance(samples: list[float]) -> float:
    """Valeur médiane d'une rafale de relevés (écarte éclaboussures et débris)."""
    if not samples:
        raise ValueError("Au moins un relevé est requis.")
    try:
        values = [float(sample) for sample in samples]
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError("Les distances doivent être numériques.") from exc
    if any(not math.isfinite(value) or not 0 < value < 1000 for value in values):
        raise ValueError(
            "Les distances doivent être finies et comprises entre 0 et 1000 cm."
        )
    return float(median(values))


def water_level_cm(mount_height_cm: float, distance_cm: float) -> float:
    """Niveau d'eau = hauteur de fixation du capteur − distance mesurée (≥ 0)."""
    return max(0.0, mount_height_cm - distance_cm)


def classify(level_cm: float, rise_cm_min: float, t: Thresholds) -> str:
    """Classe une mesure selon le niveau absolu et la vitesse de montée."""
    if level_cm >= t.red_cm or rise_cm_min >= t.red_rise_cm_min:
        return "red"
    if level_cm >= t.orange_cm or rise_cm_min >= t.orange_rise_cm_min:
        return "orange"
    return "green"


def confirmed_level(recent_levels: list[str], t: Thresholds) -> str:
    """Niveau confirmé : le plus haut niveau atteint par TOUS les derniers cycles.

    `recent_levels` est ordonné du plus récent au plus ancien. Tant que moins de
    `persistence_cycles` mesures existent, on reste en vert (pas d'alerte).
    """
    window = recent_levels[: t.persistence_cycles]
    if len(window) < t.persistence_cycles:
        return "green"
    return min(window, key=lambda lv: _RANK[lv])
