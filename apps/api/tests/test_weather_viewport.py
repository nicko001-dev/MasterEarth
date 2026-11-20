"""Tests de l'échantillonnage météo mondial à la demande (sans réseau)."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.domain import weather as w
from app.infrastructure.weather import open_meteo
from app.main import app
from app.services import weather_viewport

NOW = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
BBOX = {"south": 4.0, "west": -8.0, "north": 10.0, "east": -2.0}
ITEM_KEYS = {
    "name",
    "source",
    "lat",
    "lon",
    "updated_at",
    "intensity_3h_mm_h",
    "forecast_intensity_3h_mm_h",
    "observed_precip_mm_h",
    "observed_24h_mm",
    "observed_at",
    "observed_level",
    "modeled_precip_mm_h",
    "modeled_at",
    "modeled_24h_mm",
    "forecast_level",
    "source_kind",
    "accumulated_24h_mm",
    "level",
}

client = TestClient(app)


@pytest.fixture(autouse=True)
def _fresh_viewport_state():
    weather_viewport.reset_cache()
    weather_viewport.reset_rate_limit()
    yield
    weather_viewport.reset_cache()
    weather_viewport.reset_rate_limit()


def hourly_points() -> list[w.WeatherPoint]:
    """24 heures passées à 1 mm/h puis 2 heures prévues à 12 mm/h."""
    past = [
        w.WeatherPoint(NOW - timedelta(hours=offset), 1.0, False)
        for offset in range(24)
    ]
    future = [
        w.WeatherPoint(NOW + timedelta(hours=offset), 12.0, True)
        for offset in (1, 2)
    ]
    return sorted(past + future, key=lambda point: point.valid_at)


def provider_returning_all(points: list[w.WeatherPoint]):
    def provider(locations):
        return [open_meteo.FetchResult(location, points) for location in locations]

    return provider


def viewport_params(**overrides) -> dict:
    return {**BBOX, **overrides}


def test_valid_bbox_returns_bounded_points_with_the_weather_item_contract():
    calls = []

    def provider(locations):
        calls.append(locations)
        return provider_returning_all(hourly_points())(locations)

    result = weather_viewport.sample_viewport(
        BBOX["south"], BBOX["west"], BBOX["north"], BBOX["east"],
        provider=provider, now=NOW,
    )

    assert len(calls) == 1
    assert 1 <= len(result["points"]) <= weather_viewport.MAX_POINTS
    assert result["degraded"] is False
    assert result["failed_points"] == 0
    assert result["spacing_km"] > 0
    assert result["attribution"] == "Open-Meteo (CC BY 4.0)"
    assert result["limitations"]
    assert all(isinstance(text, str) for text in result["limitations"])
    assert set(result["bbox"]) == {"south", "west", "north", "east"}
    assert datetime.fromisoformat(result["generated_at"]).tzinfo is not None

    centre = (
        (BBOX["south"] + BBOX["north"]) / 2,
        (BBOX["west"] + BBOX["east"]) / 2,
    )
    assert any((item["lat"], item["lon"]) == centre for item in result["points"])

    for item in result["points"]:
        assert set(item) == ITEM_KEYS
        assert item["source"] == "open-meteo"
        assert item["source_kind"] == "weather_model"
        assert item["name"] == f"Open-Meteo {item['lat']:.2f},{item['lon']:.2f}"
        assert BBOX["south"] - 3 <= item["lat"] <= BBOX["north"] + 3
        assert BBOX["west"] - 3 <= item["lon"] <= BBOX["east"] + 3
        assert item["level"] in {"green", "orange", "red"}
        assert item["forecast_level"] in {"green", "orange", "red"}
        assert item["intensity_3h_mm_h"] == 12.0
        assert item["forecast_intensity_3h_mm_h"] == 12.0
        assert item["modeled_precip_mm_h"] == 1.0
        assert item["modeled_24h_mm"] == 24.0
        assert item["accumulated_24h_mm"] == 24.0
        assert item["observed_precip_mm_h"] is None
        assert item["observed_24h_mm"] == 0.0
        assert item["observed_at"] is None
        assert item["observed_level"] is None
        assert item["level"] == "green"
        assert item["forecast_level"] == "orange"
        assert datetime.fromisoformat(item["updated_at"]).tzinfo is not None
        assert datetime.fromisoformat(item["modeled_at"]).tzinfo is not None


def test_identical_bbox_is_served_from_cache():
    calls = []
    provider = provider_returning_all(hourly_points())

    def counting_provider(locations):
        calls.append(locations)
        return provider(locations)

    first = weather_viewport.sample_viewport(
        BBOX["south"],
        BBOX["west"],
        BBOX["north"],
        BBOX["east"],
        provider=counting_provider,
    )
    second = weather_viewport.sample_viewport(
        BBOX["south"],
        BBOX["west"],
        BBOX["north"],
        BBOX["east"],
        provider=counting_provider,
    )

    assert len(calls) == 1
    assert first["points"] == second["points"]
    assert first["generated_at"] == second["generated_at"]


def test_nearby_bbox_reuses_the_snapped_cache_entry():
    calls = []
    provider = provider_returning_all(hourly_points())

    def counting_provider(locations):
        calls.append(locations)
        return provider(locations)

    weather_viewport.sample_viewport(4.0, -8.0, 10.0, -2.0, provider=counting_provider)
    weather_viewport.sample_viewport(
        4.01, -7.99, 10.01, -2.01, provider=counting_provider
    )

    assert len(calls) == 1


def test_provider_raising_for_every_point_returns_degraded_payload():
    def provider(locations):
        raise TimeoutError("réseau coupé")

    result = weather_viewport.sample_viewport(
        BBOX["south"], BBOX["west"], BBOX["north"], BBOX["east"], provider=provider
    )

    assert result["degraded"] is True
    assert result["points"] == []
    assert result["error"] == "Open-Meteo indisponible"
    assert result["failed_points"] >= 1


def test_provider_errors_for_every_point_return_degraded_payload():
    def provider(locations):
        return [
            open_meteo.FetchResult(location, None, "TimeoutError")
            for location in locations
        ]

    result = weather_viewport.sample_viewport(
        BBOX["south"], BBOX["west"], BBOX["north"], BBOX["east"], provider=provider
    )

    assert result["degraded"] is True
    assert result["points"] == []
    assert result["error"] == "Open-Meteo indisponible"
    assert result["failed_points"] >= 1


def test_partial_provider_failure_keeps_successful_points():
    def provider(locations):
        results = []
        for index, location in enumerate(locations):
            if index == 0:
                results.append(open_meteo.FetchResult(location, hourly_points()))
            else:
                results.append(open_meteo.FetchResult(location, None, "TimeoutError"))
        return results

    result = weather_viewport.sample_viewport(
        BBOX["south"], BBOX["west"], BBOX["north"], BBOX["east"], provider=provider
    )

    assert result["degraded"] is False
    assert len(result["points"]) == 1
    assert result["failed_points"] >= 1
    assert result["points"][0]["name"].startswith("Open-Meteo ")


def test_large_bbox_is_clamped_to_sixty_points():
    result = weather_viewport.sample_viewport(
        -20.0,
        -60.0,
        30.0,
        -10.0,
        provider=provider_returning_all(hourly_points()),
    )

    assert 1 <= len(result["points"]) <= weather_viewport.MAX_POINTS
    assert result["spacing_km"] > weather_viewport.DEFAULT_SPACING_KM
    assert result["degraded"] is False


def test_viewport_route_samples_without_network(monkeypatch):
    monkeypatch.setattr(
        open_meteo,
        "fetch_many",
        lambda locations: [
            open_meteo.FetchResult(location, hourly_points()) for location in locations
        ],
    )

    response = client.get("/api/v1/weather/viewport", params=viewport_params())

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["degraded"] is False
    assert 1 <= len(body["points"]) <= weather_viewport.MAX_POINTS
    assert body["points"][0]["source"] == "open-meteo"
    assert body["attribution"] == "Open-Meteo (CC BY 4.0)"


def test_viewport_route_returns_a_degraded_payload_instead_of_an_error(monkeypatch):
    def unavailable(locations):
        raise TimeoutError("réseau coupé")

    monkeypatch.setattr(open_meteo, "fetch_many", unavailable)

    response = client.get("/api/v1/weather/viewport", params=viewport_params())

    assert response.status_code == 200, response.text
    assert response.json()["degraded"] is True
    assert response.json()["points"] == []


def test_viewport_route_rejects_west_not_before_east():
    response = client.get(
        "/api/v1/weather/viewport",
        params=viewport_params(west=10.0, east=10.0),
    )

    assert response.status_code == 422
    assert "strictement" in response.json()["message"]


def test_viewport_route_rejects_out_of_range_latitude():
    response = client.get(
        "/api/v1/weather/viewport", params=viewport_params(south=95.0)
    )

    assert response.status_code == 422
    assert "latitude" in response.json()["message"].lower()


def test_viewport_route_accepts_whole_world(monkeypatch):
    monkeypatch.setattr(
        open_meteo,
        "fetch_many",
        lambda locations: [
            open_meteo.FetchResult(location, hourly_points()) for location in locations
        ],
    )

    response = client.get(
        "/api/v1/weather/viewport",
        params={"west": -180.0, "south": -85.0, "east": 180.0, "north": 85.0},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert 1 <= len(body["points"]) <= weather_viewport.MAX_POINTS
    assert body["spacing_km"] > weather_viewport.DEFAULT_SPACING_KM


def test_viewport_route_requires_query_parameters():
    response = client.get("/api/v1/weather/viewport")

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


def test_viewport_route_rate_limits_per_client_host():
    invalid = viewport_params(west=10.0, east=10.0)
    for _ in range(weather_viewport.RATE_LIMIT_MAX_REQUESTS):
        assert client.get("/api/v1/weather/viewport", params=invalid).status_code == 422

    limited = client.get("/api/v1/weather/viewport", params=invalid)

    assert limited.status_code == 429
    assert limited.headers["retry-after"] == "60"
    assert "Trop de requêtes" in limited.json()["message"]
