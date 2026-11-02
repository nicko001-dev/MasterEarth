import json
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.config import settings
from app.domain import iot_adapters as ia
from app.infrastructure.db.session import get_engine
from app.main import app
from app.workers import mqtt_bridge
from tests.conftest_auth import cleanup, login_headers


def test_adapters_normalize_platforms():
    assert ia.generic({"sensor": "A", "distance_cm": 80}).samples_cm == [80.0]
    assert ia.generic({"code": "A", "distance_mm": 800}).samples_cm == [80.0]
    n = ia.ttn({"end_device_ids": {"device_id": "CI-1"}, "uplink_message": {"decoded_payload": {"samples_cm": [90, 91]}, "received_at": "2026-10-31T12:00:00Z"}})
    assert n.code == "CI-1" and n.samples_cm == [90.0, 91.0] and n.measured_at.tzinfo
    c = ia.chirpstack({"deviceInfo": {"deviceName": "CI-2"}, "object": {"distance_cm": 70}, "time": "2026-10-31T12:00:00+00:00"})
    assert c.code == "CI-2"


@pytest.mark.parametrize("bad", [{}, {"sensor": "A"}, {"sensor": "A", "distance_cm": "abc"}, {"sensor": "A", "distance_cm": -5}, {"sensor": "A", "distance_cm": 5000}, {"sensor": "A", "distance_cm": 1, "ts": "hier"}])
def test_adapters_reject_bad_payloads(bad):
    with pytest.raises(ia.PayloadError):
        ia.generic(bad)


def test_mqtt_handler_never_raises_on_garbage():
    assert mqtt_bridge.handle_message("intelliflood/sensors/X/readings", b"pas du json").startswith("rejeté")
    assert mqtt_bridge.handle_message("intelliflood/sensors/X/readings", b'{"samples_cm": []}').startswith("rejeté")
    assert mqtt_bridge.handle_message("topic-court", b"{}").startswith("rejeté")


try:
    with get_engine().connect() as c:
        c.execute(text("select 1 from sensors limit 1"))
    DB_OK = True
except Exception:
    DB_OK = False


@pytest.mark.skipif(not DB_OK, reason="PostgreSQL migré indisponible")
def test_webhooks_and_mqtt_end_to_end(monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret", "x" * 40)
    monkeypatch.setattr(settings, "ingest_api_key", "k")
    client, code = TestClient(app), f"IOT-{uuid.uuid4().hex[:6]}"
    op = login_headers(client, "operator")
    client.post("/api/v1/sensors", json={"code": code, "name": "Capteur IoT", "lon": -4, "lat": 5.3, "mount_height_cm": 150}, headers=op)
    dev = {"X-API-Key": "k"}
    ttn = {"end_device_ids": {"device_id": code}, "uplink_message": {"decoded_payload": {"distance_cm": 60}}}
    assert client.post("/api/v1/ingest/ttn", json=ttn, headers=dev).json()["water_level_cm"] == 90
    assert client.post("/api/v1/ingest/ttn", json=ttn).status_code == 401
    assert client.post("/api/v1/ingest/inconnu", json={}, headers=dev).status_code == 422
    assert client.post("/api/v1/ingest/generic", json={"sensor": code}, headers=dev).status_code == 422
    assert mqtt_bridge.handle_message(f"intelliflood/sensors/{code}/readings", json.dumps({"samples_cm": [50, 51, 50]}).encode()).startswith("ok:")
    assert mqtt_bridge.handle_message("intelliflood/sensors/INCONNU/readings", b'{"samples_cm":[50]}').startswith("rejeté")
    assert len(client.get(f"/api/v1/sensors/{code}/readings").json()) == 2
    with get_engine().begin() as conn:
        conn.execute(text("delete from sensors where code = :c"), {"c": code})
    cleanup()
