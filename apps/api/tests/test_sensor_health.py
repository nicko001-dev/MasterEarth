from datetime import datetime, timedelta, timezone

import pytest

from app.domain.sensor_health import evaluate_sensor_health

NOW = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)


def test_sensor_without_measurement_is_unknown():
    assert evaluate_sensor_health(None, 60, NOW).status == "never_reported"


def test_sensor_health_uses_configured_freshness_window():
    recent = evaluate_sensor_health(NOW - timedelta(minutes=59), 60, NOW)
    stale = evaluate_sensor_health(NOW - timedelta(minutes=60), 60, NOW)

    assert recent.status == "online"
    assert recent.minutes_since_last_reading == pytest.approx(59)
    assert stale.status == "stale"
    assert stale.minutes_since_last_reading == pytest.approx(60)


def test_sensor_health_normalizes_naive_timestamps_and_flags_future_data():
    naive = evaluate_sensor_health(datetime(2026, 11, 1, 11, 30), 60, NOW)
    future = evaluate_sensor_health(NOW + timedelta(minutes=1), 60, NOW)

    assert naive.status == "online"
    assert future.status == "clock_skew"


def test_sensor_health_rejects_invalid_freshness_window():
    with pytest.raises(ValueError):
        evaluate_sensor_health(NOW, 0, NOW)
