"""Pure robust-statistics helpers; anomaly candidates are not confirmed incidents."""

from statistics import median


def detect_level_anomalies(
    values: list[float],
    *,
    minimum_samples: int = 5,
    threshold_mad: float = 3.5,
) -> dict | None:
    """Compare the newest level to prior levels using a median absolute deviation."""
    if len(values) <= minimum_samples:
        return None
    history = values[:-1]
    center = median(history)
    deviations = [abs(value - center) for value in history]
    mad = median(deviations)
    current = values[-1]
    delta = abs(current - center)
    score = delta / (1.4826 * mad) if mad else (float("inf") if delta else 0.0)
    if score < threshold_mad:
        return None
    return {
        "value": current,
        "baseline_median": center,
        "robust_score": None if score == float("inf") else round(score, 2),
        "reason": "Écart statistique inhabituel par rapport aux mesures précédentes.",
        "method": "median_absolute_deviation",
        "threshold_mad": threshold_mad,
    }
