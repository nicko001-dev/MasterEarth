import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.config import settings
from app.infrastructure.db.session import get_engine
from app.main import app
from app.services import simulation
from tests.conftest_auth import cleanup, login_headers

try:
    with get_engine().connect() as c:
        c.execute(text("select 1 from simulation_runs limit 1"))
    DB_OK = True
except Exception:
    DB_OK = False
pytestmark = pytest.mark.skipif(not DB_OK, reason="PostgreSQL migré indisponible")


def fake_ground(south, west, north, east, rows, cols):
    y, x = np.mgrid[0:rows, 0:cols]
    return 0.02 * np.hypot(x - cols // 2, y - rows // 2) ** 2 + 5.0


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret", "x" * 40)
    monkeypatch.setattr(simulation, "ground_provider", fake_ground)
    simulation._RUNS.clear()
    yield TestClient(app)
    with get_engine().begin() as conn:
        conn.execute(text("delete from simulation_runs"))
        conn.execute(text("delete from sensors where code like 'SIM-%'"))
    cleanup()


def test_flood_levels_rain_and_traceability(client):
    h = login_headers(client, "viewer")
    assert client.post("/api/v1/simulations/flood", json={"mode": "level", "lat": 5.3, "lon": -4.0, "rise_m": 1}).status_code == 401
    r = client.post("/api/v1/simulations/flood", headers=h, json={"mode": "level", "lat": 5.3, "lon": -4.0, "rise_m": 2, "cells": 60})
    assert r.status_code == 201, r.text
    a = r.json()
    assert a["stats"]["max_depth_m"] == pytest.approx(2.0, abs=0.05) and a["rows"] == 60 and a["disclaimer"]
    assert len(__import__("base64").b64decode(a["depth_cm_b64"])) == 60 * 60 * 2
    b = client.post("/api/v1/simulations/flood", headers=h, json={"mode": "level", "lat": 5.3, "lon": -4.0, "rise_m": 4, "cells": 60}).json()
    assert b["stats"]["area_km2"] > a["stats"]["area_km2"]
    rain = client.post("/api/v1/simulations/flood", headers=h, json={"mode": "rain", "lat": 5.3, "lon": -4.0, "rain_mm_h": 40, "hours": 3, "cells": 60})
    assert rain.status_code == 201 and rain.json()["stats"]["volume_m3"] > 0
    fr = client.post("/api/v1/simulations/flood", headers=h, json={"mode": "level", "lat": 5.3, "lon": -4.0, "rise_m": 3, "cells": 50, "steps": 4}).json()["frames"]
    assert [f["fraction"] for f in fr] == [0.25, 0.5, 0.75, 1.0] and fr[0]["max_depth_m"] < fr[-1]["max_depth_m"]  # montée progressive
    assert client.get(f"/api/v1/simulations/{a['id']}", headers=h).json()["params"]["rise_m"] == 2
    assert client.post("/api/v1/simulations/flood", headers=h, json={"mode": "rain", "lat": 5.3, "lon": -4.0}).status_code == 422


def test_sensor_mode_needs_bankfull_then_uses_latest_level(client):
    op = login_headers(client, "operator")
    body = {"code": "SIM-1", "name": "Capteur sim", "lon": -4.0, "lat": 5.3, "mount_height_cm": 150}
    assert client.post("/api/v1/sensors", json=body, headers=op).status_code == 201
    r = client.post("/api/v1/simulations/flood", headers=op, json={"mode": "sensor", "sensor_code": "SIM-1", "cells": 50})
    assert r.status_code == 422 and "BANKFULL" in r.text.upper()
    with get_engine().begin() as conn:
        conn.execute(text("update sensors set bankfull_cm = 60 where code = 'SIM-1'"))
    assert client.post("/api/v1/sensors/SIM-1/readings", json={"samples_cm": [30]}, headers=op).status_code == 201  # niveau 120 cm
    r = client.post("/api/v1/simulations/flood", headers=op, json={"mode": "sensor", "sensor_code": "SIM-1", "cells": 50})
    assert r.status_code == 201 and r.json()["stats"]["max_depth_m"] == pytest.approx(0.6, abs=0.05)  # (120-60) cm au-dessus du bord


def test_dem_failure_is_reported_not_crashed(client, monkeypatch):
    def boom(*a):
        raise TimeoutError("réseau")
    monkeypatch.setattr(simulation, "ground_provider", boom)
    r = client.post("/api/v1/simulations/flood", headers=login_headers(client, "viewer"), json={"mode": "level", "lat": 5.3, "lon": -4.0, "rise_m": 1})
    assert r.status_code == 422 and "DEM_UNAVAILABLE" in r.text
