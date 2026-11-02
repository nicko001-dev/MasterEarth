"""Domaine météo pur : points horaires de précipitations et niveau de risque pluie."""

from dataclasses import dataclass
from datetime import datetime, timedelta


@dataclass(frozen=True)
class WeatherPoint:
    valid_at: datetime  # fin de l'heure concernée, UTC
    precip_mm: float  # cumul de l'heure précédant valid_at
    is_forecast: bool


@dataclass(frozen=True)
class RainThresholds:
    """Seuils PROVISOIRES : à valider opérationnellement."""

    orange_mm_h: float = 10.0
    red_mm_h: float = 30.0
    orange_24h_mm: float = 50.0
    red_24h_mm: float = 100.0


def rain_risk(intensity_mm_h: float, accumulated_24h_mm: float, t: RainThresholds) -> str:
    if intensity_mm_h >= t.red_mm_h or accumulated_24h_mm >= t.red_24h_mm:
        return "red"
    if intensity_mm_h >= t.orange_mm_h or accumulated_24h_mm >= t.orange_24h_mm:
        return "orange"
    return "green"


def summarize(points: list[tuple[datetime, float]], now: datetime, t: RainThresholds) -> dict:
    """Intensité max des 3 prochaines heures, cumul des 24 dernières heures et niveau de risque."""
    ahead = [mm for ts, mm in points if now < ts <= now + timedelta(hours=3)]
    past = [mm for ts, mm in points if now - timedelta(hours=24) < ts <= now]
    intensity = max(ahead, default=0.0)
    total = sum(past)
    return {"intensity_3h_mm_h": round(intensity, 1), "accumulated_24h_mm": round(total, 1),
            "level": rain_risk(intensity, total, t)}
