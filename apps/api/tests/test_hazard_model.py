"""Tests du modèle indicatif multi-aléas."""

import pytest

from app.domain import hazard_model


ALL_HAZARDS = tuple(hazard_model.SIMULATORS)


@pytest.mark.parametrize("hazard", ALL_HAZARDS)
def test_every_hazard_returns_a_bounded_indicative_result(hazard):
    result = hazard_model.simulate(hazard, {}, 5.36, -4.01, "Abidjan")

    assert result["hazard"] == hazard
    assert result["label"]
    assert result["model"] == hazard_model.MODEL_VERSION
    assert result["center"] == {"lat": 5.36, "lon": -4.01, "name": "Abidjan"}
    assert 0 <= result["intensity_index"] <= 100
    assert result["severity"] in hazard_model.SEVERITY_LABELS
    assert result["metrics"]
    assert len(result["timeline"]) >= 5
    assert result["disclaimer"] == hazard_model.DISCLAIMER
    assert result["limitations"]
    assert result["assumptions"]


def test_earthquake_simulation_uses_magnitude_depth_and_explicit_basis():
    result = hazard_model.simulate(
        "earthquake", {"magnitude": 7.6, "depth_km": 42}, 35.7, 140.3, "Japon"
    )

    metrics = {metric["key"]: metric for metric in result["metrics"]}
    assert metrics["magnitude"]["value"] == 7.6
    assert metrics["profondeur_km"]["value"] == 42.0
    assert metrics["intensite_mmi"]["value"] > 7
    assert metrics["longueur_rupture_km"]["value"] > 10
    assert "empirique" in metrics["intensite_mmi"]["basis"].lower()
    assert result["severity"] in ("high", "extreme")
    assert "répliques" in " ".join(result["statements"])


def test_tsunami_arrival_time_increases_with_distance():
    near = hazard_model.simulate(
        "tsunami", {"magnitude": 8.5, "ocean_depth_m": 4000, "distance_coast_km": 100}, 0, 0
    )
    far = hazard_model.simulate(
        "tsunami", {"magnitude": 8.5, "ocean_depth_m": 4000, "distance_coast_km": 2000}, 0, 0
    )

    near_metrics = {metric["key"]: metric["value"] for metric in near["metrics"]}
    far_metrics = {metric["key"]: metric["value"] for metric in far["metrics"]}
    assert 0 < near_metrics["arrivee_min"] < far_metrics["arrivee_min"]
    assert near_metrics["vitesse_kmh"] == pytest.approx(713.1, rel=0.01)


def test_hurricane_category_and_surge_are_derived_from_wind():
    result = hazard_model.simulate(
        "hurricane", {"wind_kmh": 280, "pressure_hpa": 920, "rain_mm_h": 30, "duration_h": 12}, 20, -70
    )

    metrics = {metric["key"]: metric["value"] for metric in result["metrics"]}
    assert metrics["category"] == 5
    assert metrics["surge_m"] > 5
    assert metrics["pluie_totale_mm"] == 360
    assert result["severity"] == "extreme"


def test_drought_is_more_severe_with_a_larger_deficit():
    wet = hazard_model.simulate("drought", {"rain_mm": 390, "normal_mm": 400, "duration_h": 90}, 0, 0)
    dry = hazard_model.simulate("drought", {"rain_mm": 40, "normal_mm": 400, "duration_h": 90}, 0, 0)

    assert dry["intensity_index"] > wet["intensity_index"]
    assert dry["severity"] in ("high", "extreme")


def test_landslide_factor_of_safety_decreases_with_rain_and_slope():
    gentle = hazard_model.simulate(
        "landslide", {"slope_deg": 15, "rain_mm_h": 2, "soil_moisture": 0.2, "height_m": 50}, 0, 0
    )
    steep = hazard_model.simulate(
        "landslide", {"slope_deg": 45, "rain_mm_h": 90, "soil_moisture": 0.95, "height_m": 200}, 0, 0
    )

    gentle_fs = next(metric["value"] for metric in gentle["metrics"] if metric["key"] == "facteur_securite")
    steep_fs = next(metric["value"] for metric in steep["metrics"] if metric["key"] == "facteur_securite")
    assert steep_fs < gentle_fs


def test_unknown_hazard_and_invalid_coordinates_are_rejected():
    with pytest.raises(ValueError):
        hazard_model.simulate("meteor", {}, 0, 0)
    with pytest.raises(ValueError):
        hazard_model.simulate("flood", {}, 120, 0)
