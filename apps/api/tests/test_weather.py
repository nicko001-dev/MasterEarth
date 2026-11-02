from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.config import settings
from app.domain import weather as w
from app.infrastructure.db.session import get_engine, session_scope
from app.infrastructure.weather import open_meteo
from app.main import app
from tests.conftest_auth import cleanup, login_headers
from app.services import weather as svc

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
        assert row["level"] == "red" and row["intensity_3h_mm_h"] == 40.0
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
    assert row["source"] == "sodexam" and row["level"] == "orange"
    with get_engine().begin() as conn:
        conn.execute(text("delete from weather_observations where source='sodexam' and point_key='5.31,-4.02'"))
    cleanup()
