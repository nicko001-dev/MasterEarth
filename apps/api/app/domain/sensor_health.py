"""Classification déterministe de la fraîcheur des mesures capteurs."""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

HealthStatus = Literal["never_reported", "online", "stale", "clock_skew"]


@dataclass(frozen=True)
class SensorHealth:
    status: HealthStatus
    minutes_since_last_reading: float | None


def evaluate_sensor_health(
    last_measured_at: datetime | None,
    stale_after_minutes: int,
    now: datetime | None = None,
) -> SensorHealth:
    """Classify a sensor using its last measurement and a configurable cadence."""
    if stale_after_minutes < 1:
        raise ValueError("Le délai de fraîcheur doit être d'au moins une minute.")
    if last_measured_at is None:
        return SensorHealth("never_reported", None)

    current_time = now or datetime.now(timezone.utc)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=timezone.utc)
    if last_measured_at.tzinfo is None:
        last_measured_at = last_measured_at.replace(tzinfo=timezone.utc)

    age_minutes = (current_time - last_measured_at).total_seconds() / 60
    if age_minutes < 0:
        return SensorHealth("clock_skew", 0.0)
    if age_minutes >= stale_after_minutes:
        return SensorHealth("stale", age_minutes)
    return SensorHealth("online", age_minutes)
