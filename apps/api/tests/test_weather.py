import io
import json
import math
import urllib.parse
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.config import settings
from app.domain import weather as w
from app.infrastructure.db.session import get_engine, session_scope
from app.infrastructure.weather import open_meteo
from app.infrastructure.weather import openweather
from app.main import app
from tests.conftest_auth import cleanup, login_headers
from app.services import weather as svc
from app.services import simulation as simulation_svc
from app.services import weather_sampling

T = w.RainThresholds()
NOW = datetime(2026, 10, 31, 12, 0, tzinfo=timezone.utc)


def test_rain_risk_levels():
    assert w.rain_risk(2, 10, T) == "green"
    assert w.rain_risk(12, 0, T) == "orange"
    assert w.rain_risk(0, 60, T) == "orange"
    assert w.rain_risk(35, 0, T) == "red"
    assert w.rain_risk(0, 120, T) == "red"


def test_summarize_windows():
    pts = [(NOW - timedelta(hours=h), 5.0) for h in range(0, 30)] + [(NOW + timedelta(hours=1), 14.0), (NOW + timedelta(hours=5), 90.0)]
    s = w.summarize(pts, NOW, T)
    assert s["intensity_3h_mm_h"] == 14.0  # la prévision à +5 h est hors fenêtre
    assert s["accumulated_24h_mm"] == 120.0  # 24 heures seulement
    assert s["level"] == "red"


def test_open_meteo_parse_skips_missing_values():
    payload = {"hourly": {"time": ["2026-10-31T10:00", "2026-10-31T11:00", "2026-10-31T13:00"], "precipitation": [1.5, None, 4.0]}}
    pts = open_meteo.parse(payload, NOW)
    assert [(p.precip_mm, p.is_forecast) for p in pts] == [(1.5, False), (4.0, True)]
    assert open_meteo.parse({}, NOW) == []


def test_open_meteo_current_precipitation_overrides_same_hour_model_value():
    payload = {
        "current": {"time": "2026-10-31T12:00", "precipitation": 4.5},
        "hourly": {
            "time": ["2026-10-31T11:00", "2026-10-31T12:00"],
            "precipitation": [1.5, 3.0],
        },
    }

    points = open_meteo.parse(payload, NOW)

    assert points == [
        w.WeatherPoint(NOW - timedelta(hours=1), 1.5, False),
        w.WeatherPoint(NOW, 4.5, False),
    ]


def test_open_meteo_parse_rejects_malformed_or_impossible_precipitation():
    with pytest.raises(ValueError, match="Open-Meteo invalide"):
        open_meteo.parse(
            {"current": {"time": "2026-10-31T12:00", "precipitation": "bad"}},
            NOW,
        )
    with pytest.raises(ValueError, match="hors limites"):
        open_meteo.parse(
            {"current": {"time": "2026-10-31T12:00", "precipitation": 501}},
            NOW,
        )


def test_open_meteo_fetch_many_parses_a_multi_location_response(monkeypatch):
    locations = [("Abidjan", 5.35, -4.0), ("Yamoussoukro", 6.85, -5.3)]
    payload = [
        {"current": {"time": "2026-10-31T12:00", "precipitation": 1.5}},
        {"current": {"time": "2026-10-31T12:00", "precipitation": 2.5}},
    ]
    requests = []

    def fake_urlopen(url, timeout):
        requests.append((url, timeout))
        return io.BytesIO(json.dumps(payload).encode())

    monkeypatch.setattr(open_meteo.urllib.request, "urlopen", fake_urlopen)

    results = open_meteo.fetch_many(locations)

    assert [result.location for result in results] == locations
    assert [result.points[0].precip_mm for result in results] == [1.5, 2.5]
    query = urllib.parse.parse_qs(urllib.parse.urlparse(requests[0][0]).query)
    assert query["latitude"] == ["5.35,6.85"]
    assert query["longitude"] == ["-4.0,-5.3"]


def test_open_meteo_fetch_many_limits_batch_size_and_keeps_later_batches(monkeypatch):
    locations = [(f"Point {index}", 5.0, -4.0) for index in range(101)]
    requests = []

    def fake_urlopen(url, timeout):
        requests.append(url)
        if len(requests) == 1:
            raise TimeoutError("provider unavailable")
        payload = {"current": {"time": "2026-10-31T12:00", "precipitation": 0}}
        return io.BytesIO(json.dumps(payload).encode())

    monkeypatch.setattr(open_meteo.urllib.request, "urlopen", fake_urlopen)

    results = open_meteo.fetch_many(locations)

    assert len(requests) == 2
    assert len(results) == 101
    assert all(result.error == "TimeoutError" for result in results[:100])
    assert results[-1].error is None
    assert results[-1].points[0].precip_mm == 0


def test_anchored_sample_points_are_inside_boundary_and_about_50_km_apart():
    points = weather_sampling.anchored_sample_points()
    boundary = weather_sampling.anchored_boundary()

    assert 120 <= len(points) <= 140
    assert all(boundary.covers(weather_sampling.Point(lon, lat)) for _, lat, lon in points)
    assert all(name.startswith("Sondage 50 km") for name, _, _ in points)
    distances = [
        abs(lon - other_lon) * 111.32 * math.cos(math.radians(lat))
        for index, (_, lat, lon) in enumerate(points)
        for _, other_lat, other_lon in points[index + 1 :]
        if abs(lat - other_lat) < 0.001 and 0 < abs(lon - other_lon) < 0.6
    ]
    assert any(49 <= distance <= 51 for distance in distances)


def test_openweather_parse_returns_current_rain_and_treats_missing_rain_as_zero():
    timestamp = int(NOW.timestamp())
    rainy = openweather.parse({"dt": timestamp, "rain": {"1h": 3.2}})
    dry = openweather.parse({"dt": timestamp})

    assert rainy == [w.WeatherPoint(NOW, 3.2, False)]
    assert dry == [w.WeatherPoint(NOW, 0.0, False)]


def test_openweather_parse_rejects_malformed_or_impossible_data():
    with pytest.raises(ValueError, match="Réponse OpenWeather invalide"):
        openweather.parse({})
    with pytest.raises(ValueError, match="Réponse OpenWeather invalide"):
        openweather.parse({"dt": int(NOW.timestamp()), "rain": "invalid"})
    with pytest.raises(ValueError, match="hors limites"):
        openweather.parse({"dt": int(NOW.timestamp()), "rain": {"1h": 501}})


def test_openweather_http_error_does_not_expose_server_key(monkeypatch):
    api_key = "private-test-key"

    def fail(request, timeout):
        assert api_key in request.full_url
        raise openweather.urllib.error.HTTPError(
            request.full_url, 401, "Unauthorized", {}, None
        )

    monkeypatch.setattr(openweather.urllib.request, "urlopen", fail)

    with pytest.raises(RuntimeError, match="HTTP 401") as error:
        openweather.fetch(5.0, -4.0, api_key)

    assert api_key not in str(error.value)


def test_refresh_uses_openweather_only_when_a_server_key_is_configured(monkeypatch):
    seen = []
    point = ("TestVille", 5.0, -4.0)
    monkeypatch.setattr(settings, "weather_openweather_api_key", "test-server-key")
    monkeypatch.setattr(svc, "_all_points", lambda _db: [point])
    monkeypatch.setattr(svc, "store", lambda _db, source, *_args: seen.append(source) or 1)

    def openweather_provider(lat, lon, api_key):
        assert (lat, lon, api_key) == (5.0, -4.0, "test-server-key")
        return []

    result = svc.refresh(None, lambda _lat, _lon: [], openweather_provider)

    assert result["points_ok"] == 1
    assert result["openweather_points_ok"] == ["TestVille"]
    assert seen == ["open-meteo", "openweather"]
    assert "test-server-key" not in repr(result)


def test_refresh_uses_batched_open_meteo_results_and_reports_failed_points(monkeypatch):
    points = [("Zone 1", 5.0, -4.0), ("Zone 2", 6.0, -5.0)]
    monkeypatch.setattr(svc, "_all_points", lambda _db: points)
    monkeypatch.setattr(settings, "weather_openweather_api_key", "")
    monkeypatch.setattr(
        open_meteo,
        "fetch_many",
        lambda locations: [
            open_meteo.FetchResult(locations[0], [w.WeatherPoint(NOW, 3.0, False)]),
            open_meteo.FetchResult(locations[1], None, "TimeoutError"),
        ],
    )
    stored = []
    monkeypatch.setattr(
        svc,
        "store",
        lambda _db, source, name, *_args: stored.append((source, name)) or 1,
    )

    result = svc.refresh(None)

    assert result["points_ok"] == 1
    assert result["points_failed"] == ["Zone 2"]
    assert result["rows"] == 1
    assert stored == [("open-meteo", "Zone 1")]


def test_weather_source_status_reports_worldwide_and_anchored_coverage():
    class EmptyDb:
        def execute(self, *_args):
            return self

        def all(self):
            return []

    status = svc.source_status(EmptyDb())
    coverage = status["coverage"]

    assert coverage["scope"] == "worldwide"
    assert coverage["worldwide_sampling"]["max_points"] == 60
    assert coverage["worldwide_sampling"]["max_bbox_area_km2"] == 510_100_000
    assert coverage["anchored_points"]["region"] == "Côte d'Ivoire (réseau déployé)"
    assert coverage["anchored_points"]["spacing_km"] == 50
    assert coverage["anchored_points"]["points"] == 129


try:
    with get_engine().connect() as c:
        c.execute(text("select 1 from weather_observations limit 1"))
    DB_OK = True
except Exception:
    DB_OK = False
db_only = pytest.mark.skipif(not DB_OK, reason="PostgreSQL migré indisponible")


@db_only
def test_refresh_is_idempotent_and_survives_provider_failure(monkeypatch):
    monkeypatch.setattr(svc, "_all_points", lambda db: [("TestVille", 5.0, -4.0), ("Panne", 6.0, -5.0)])  # isole le test des capteurs réels
    monkeypatch.setattr(settings, "weather_openweather_api_key", "")
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)

    def provider(lat, lon):
        if lat == 6.0:
            raise TimeoutError("réseau coupé")
        return [WeatherPoint(now + timedelta(hours=1), 40.0, True), WeatherPoint(now, 2.0, False)]

    WeatherPoint = w.WeatherPoint
    with session_scope() as db:
        first = svc.refresh(db, provider)
        second = svc.refresh(db, provider)
        assert first["points_failed"] == ["Panne"] and first["points_ok"] >= 1
        assert second["rows"] == first["rows"]
        row = next(r for r in svc.summary(db) if r["name"] == "TestVille")
        assert row["level"] == "green"
        assert row["forecast_level"] == "red"
        assert row["intensity_3h_mm_h"] == 40.0
        assert row["observed_precip_mm_h"] is None
        assert row["modeled_precip_mm_h"] == 2.0
        assert row["source_kind"] == "weather_model"
        count = db.execute(text("select count(*) from weather_observations where point_key='5.00,-4.00'")).scalar()
        assert count == 2  # pas de doublon après deux collectes
    with get_engine().begin() as conn:
        conn.execute(text("delete from weather_observations where point_key in ('5.00,-4.00','6.00,-5.00')"))


@db_only
def test_manual_bulletin_requires_key_and_is_listed(monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret", "x" * 40)
    client = TestClient(app)
    op = login_headers(client, "operator")
    body = {"source": "sodexam", "name": "Test bulletin", "lat": 5.31, "lon": -4.02,
            "valid_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(), "precip_mm": 55}
    assert client.post("/api/v1/weather/observations", json=body).status_code == 401
    assert client.post("/api/v1/weather/observations", json=body, headers=op).status_code == 201
    row = next(r for r in client.get("/api/v1/weather").json() if r["name"] == "Test bulletin")
    assert row["source"] == "sodexam" and row["level"] == "red"
    assert row["observed_level"] == "red"
    with get_engine().begin() as conn:
        conn.execute(text("delete from weather_observations where source='sodexam' and point_key='5.31,-4.02'"))
    cleanup()


@db_only
def test_rain_gauge_ingestion_uses_weather_provenance_and_rejects_water_level_sensor(monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret", "x" * 40)
    monkeypatch.setattr(simulation_svc, "ground_provider", lambda *_args: np.zeros((80, 80)))
    client = TestClient(app)
    op = login_headers(client, "operator")
    suffix = datetime.now(timezone.utc).strftime("%H%M%S%f")
    code = f"RAIN-{suffix}"
    created = client.post(
        "/api/v1/sensors",
        headers=op,
        json={
            "code": code,
            "name": "Pluviomètre de test",
            "lat": 5.31,
            "lon": -4.02,
            "kind": "rain_gauge",
        },
    )
    assert created.status_code == 201, created.text

    body = {"precip_mm": 12.5, "measured_at": datetime.now(timezone.utc).isoformat()}
    assert client.post(f"/api/v1/sensors/{code}/rainfall", json=body).status_code == 401
    response = client.post(f"/api/v1/sensors/{code}/rainfall", headers=op, json=body)
    assert response.status_code == 201, response.text
    assert response.json()["precip_mm"] == 12.5
    item = next(row for row in client.get("/api/v1/weather").json() if row["source"] == "iot-rain-gauge" and row["name"] == "Pluviomètre de test")
    assert item["observed_precip_mm_h"] == 12.5
    assert item["source_kind"] == "iot_gauge"
    model_when = datetime.now(timezone.utc)
    with session_scope() as db:
        svc.store(
            db,
            "open-meteo",
            "Point modèle de test",
            5.34,
            -4.04,
            [w.WeatherPoint(model_when, 12.5, False)],
        )
    model_item = next(
        row
        for row in client.get("/api/v1/weather").json()
        if row["source"] == "open-meteo" and row["name"] == "Point modèle de test"
    )
    assert model_item["observed_precip_mm_h"] is None
    assert model_item["modeled_precip_mm_h"] == 12.5
    assert model_item["source_kind"] == "weather_model"
    with get_engine().connect() as conn:
        before_runs = conn.execute(text("select count(*) from simulation_runs")).scalar()
    automatic = client.get("/api/v1/simulations/automatic")
    assert automatic.status_code == 200, automatic.text
    event = next(row for row in automatic.json()["events"] if row["source"] == "iot-rain-gauge" and row["name"] == "Pluviomètre de test")
    assert event["type"] == "rain_impact_estimate"
    assert event["simulation"]["result"]["stats"]["area_km2"] > 0
    model_event = next(
        row for row in automatic.json()["events"]
        if row["source"] == "open-meteo" and row["name"] == "Point modèle de test"
    )
    assert model_event["source_kind"] == "weather_model"
    with get_engine().connect() as conn:
        after_runs = conn.execute(text("select count(*) from simulation_runs")).scalar()
    assert after_runs == before_runs

    water_sensor = client.post(
        "/api/v1/sensors",
        headers=op,
        json={
            "code": f"WATER-{suffix}",
            "name": "Niveau de test",
            "lat": 5.32,
            "lon": -4.03,
            "mount_height_cm": 100,
            "bankfull_cm": 40,
        },
    )
    assert water_sensor.status_code == 201, water_sensor.text
    water_code = water_sensor.json()["code"]
    water_reading = client.post(
        f"/api/v1/sensors/{water_code}/readings",
        headers=op,
        json={"samples_cm": [10], "measured_at": datetime.now(timezone.utc).isoformat()},
    )
    assert water_reading.status_code == 201, water_reading.text
    before_runs = None
    with get_engine().connect() as conn:
        before_runs = conn.execute(text("select count(*) from simulation_runs")).scalar()
    automatic = client.get("/api/v1/simulations/automatic")
    assert automatic.status_code == 200, automatic.text
    events = automatic.json()["events"]
    assert any(event["source"] == "iot-rain-gauge" for event in events)
    water_event = next(event for event in events if event.get("sensor_code") == water_code)
    assert water_event["type"] == "water_level_estimate"
    assert water_event["simulation"]["result"]["stats"]["area_km2"] > 0
    with get_engine().connect() as conn:
        after_runs = conn.execute(text("select count(*) from simulation_runs")).scalar()
    assert after_runs == before_runs

    mismatch = client.post(
        f"/api/v1/sensors/{water_code}/rainfall",
        headers=op,
        json=body,
    )
    assert mismatch.status_code == 422
    assert mismatch.json()["code"] == "SENSOR_TYPE_MISMATCH"

    with get_engine().begin() as conn:
        conn.execute(text("delete from weather_observations where source='iot-rain-gauge' and point_key='5.31,-4.02'"))
        conn.execute(text("delete from weather_observations where source='open-meteo' and point_key='5.34,-4.04'"))
        conn.execute(text("delete from sensors where code in (:rain, :water)"), {"rain": code, "water": f"WATER-{suffix}"})
    simulation_svc._AUTOMATIC_CACHE.clear()
    simulation_svc._AUTOMATIC_FAILURES.clear()
    cleanup()
