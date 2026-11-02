import pytest

from app.api.routes.monitoring import ReadingIn
from app.domain import alerting as a
from app.services.monitoring import format_alert_message

T = a.Thresholds()


def test_median_ignores_splash():
    assert a.median_distance([120, 121, 20, 119, 122, 120, 118]) == 120


@pytest.mark.parametrize("samples", [[0], [-1], [1000], [float("nan")], [float("inf")]])
def test_median_rejects_non_finite_and_implausible_distances(samples):
    with pytest.raises(ValueError):
        a.median_distance(samples)


@pytest.mark.parametrize("sample", [0, -1, 1000, float("nan"), float("inf")])
def test_reading_request_rejects_non_finite_and_implausible_distances(sample):
    with pytest.raises(ValueError):
        ReadingIn(samples_cm=[sample])


def test_alert_message_marks_return_to_green_as_ended():
    assert format_alert_message("Caniveau", "green", 20, "orange") == (
        "Alerte terminée pour Caniveau : le niveau est revenu à Vert (20 cm)."
    )
    assert format_alert_message("Caniveau", "red", 90, "orange") == (
        "Caniveau : niveau Rouge (90 cm)"
    )


def test_level_never_negative():
    assert a.water_level_cm(150, 200) == 0


def test_classification():
    assert a.classify(10, 0, T) == "green"
    assert a.classify(45, 0, T) == "orange"
    assert a.classify(85, 0, T) == "red"
    assert a.classify(10, 12, T) == "red"  # montée très rapide


def test_persistence_requires_consecutive_cycles():
    assert a.confirmed_level(["red", "green", "green"], T) == "green"
    assert a.confirmed_level(["red", "red"], T) == "green"  # pas assez de cycles
    assert a.confirmed_level(["red", "orange", "red"], T) == "orange"
    assert a.confirmed_level(["red", "red", "red"], T) == "red"
