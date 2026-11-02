"""Tests d'intégration contre un vrai PostgreSQL/PostGIS (ignorés s'il est injoignable)."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.config import settings
from app.infrastructure.db.session import get_engine
from app.main import app
from tests.conftest_auth import cleanup, login_headers

try:
    with get_engine().connect() as c:
        c.execute(text("select 1 from sensors limit 1"))
    DB_OK = True
except Exception:
    DB_OK = False

pytestmark = pytest.mark.skipif(not DB_OK, reason="PostgreSQL migré indisponible")
H = {"X-API-Key": "test-key"}


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(settings, "ingest_api_key", "test-key")
    monkeypatch.setattr(settings, "jwt_secret", "x" * 40)
    yield TestClient(app)
    cleanup()


def test_write_requires_key(client):
    assert client.post("/api/v1/sensors", json={}).status_code in (401, 422)
    body = {"code": "x", "name": "x", "lon": -4, "lat": 5, "mount_height_cm": 150}
    assert client.post("/api/v1/sensors", json=body).status_code == 401
    assert client.post("/api/v1/sensors", json=body, headers=H).status_code == 401  # la clé d'appareil ne crée pas de capteur


def test_full_alert_flow(client):
    code = f"T-{uuid.uuid4().hex[:8]}"
    body = {"code": code, "name": "Caniveau test", "lon": -3.98, "lat": 5.36, "mount_height_cm": 150}
    op = login_headers(client, "operator")
    assert client.post("/api/v1/sensors", json=body, headers=op).status_code == 201
    assert client.post("/api/v1/sensors", json=body, headers=op).status_code == 409
    t0 = datetime.now(timezone.utc)
    triggered = []
    for i in range(4):  # niveau ≈ 90 cm : rouge, confirmé au 3e cycle
        r = client.post(f"/api/v1/sensors/{code}/readings", headers=H,
                        json={"samples_cm": [60, 61, 10, 59, 60, 62, 60],
                              "measured_at": (t0 + timedelta(minutes=i)).isoformat()})
        assert r.status_code == 201
        triggered.append(r.json()["alert_triggered"])
    assert triggered == [None, None, "red", None]  # persistance + pas de doublon
    alerts = [a for a in client.get("/api/v1/alerts").json() if a["sensor_code"] == code]
    assert len(alerts) == 1 and alerts[0]["level"] == "red"
    state = next(s for s in client.get("/api/v1/sensors").json() if s["code"] == code)
    assert state["alert_level"] == "red" and state["lon"] == pytest.approx(-3.98)
    assert client.get("/api/v1/sensors/nope/readings").status_code == 404
    with get_engine().begin() as conn:  # nettoyage : le test ne laisse aucune donnée
        conn.execute(text("delete from sensors where code = :c"), {"c": code})
