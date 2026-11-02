"""Tests de validation et d'accès des observations terrain."""

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import text

from app.config import settings
from app.infrastructure.db.session import get_engine
from app.main import app
from app.schemas.observations import ObservationCreate
from tests.conftest_auth import cleanup, login_headers


def test_observation_requires_timezone_and_nonempty_text():
    with pytest.raises(ValidationError):
        ObservationCreate(
            observation_type="eau",
            description="Crue en cours",
            observed_at=datetime(2026, 11, 1),
            lon=-4,
            lat=5,
        )
    with pytest.raises(ValidationError):
        ObservationCreate(
            observation_type=" ",
            description="Crue en cours",
            observed_at=datetime.now(timezone.utc),
            lon=-4,
            lat=5,
        )


try:
    with get_engine().connect() as connection:
        connection.execute(text("select 1 from field_observations limit 1"))
    DB_OK = True
except Exception:
    DB_OK = False


@pytest.mark.skipif(not DB_OK, reason="PostgreSQL migré indisponible")
def test_anonymous_observation_submission_and_visibility(monkeypatch):
    """Un citoyen sans compte peut signaler un terrain sans voir les signalements non vérifiés."""
    monkeypatch.setattr(settings, "jwt_secret", "x" * 40)
    client = TestClient(app)
    moderator = login_headers(client, "admin")
    description = f"Observation anonyme {uuid.uuid4()}"
    try:
        created = client.post(
            "/api/v1/observations",
            json={
                "observation_type": "eau",
                "description": description,
                "observed_at": datetime.now(timezone.utc).isoformat(),
                "lon": -4.02,
                "lat": 5.35,
            },
        )
        assert created.status_code == 201, created.text
        item = created.json()
        assert item["source"] == "human"
        assert item["status"] == "new"
        assert item["created_by_user_id"] is None

        anonymous_list = client.get("/api/v1/observations").json()
        assert [o["id"] for o in anonymous_list if o["id"] == item["id"]] == []

        verified = client.patch(
            f"/api/v1/observations/{item['id']}/status",
            headers=moderator,
            json={"status": "verified"},
        )
        assert verified.status_code == 200, verified.text

        anonymous_list = client.get("/api/v1/observations").json()
        assert [o["id"] for o in anonymous_list if o["id"] == item["id"]] == [item["id"]]
    finally:
        with get_engine().begin() as connection:
            connection.execute(
                text("delete from field_observations where description = :description"),
                {"description": description},
            )
        cleanup()


@pytest.mark.skipif(not DB_OK, reason="PostgreSQL migré indisponible")
def test_observation_visibility_and_moderation(monkeypatch):
    monkeypatch.setattr(settings, "jwt_secret", "x" * 40)
    client = TestClient(app)
    creator = login_headers(client, "viewer")
    other_user = login_headers(client, "viewer")
    moderator = login_headers(client, "admin")
    description = f"Observation test {uuid.uuid4()}"
    try:
        response = client.post(
            "/api/v1/observations",
            headers=creator,
            json={
                "observation_type": "eau",
                "description": description,
                "observed_at": datetime.now(timezone.utc).isoformat(),
                "lon": -4.01,
                "lat": 5.36,
            },
        )
        assert response.status_code == 201, response.text
        item = response.json()
        assert item["source"] == "human"
        assert item["status"] == "new"
        assert item["lon"] == pytest.approx(-4.01)
        assert [o["id"] for o in client.get("/api/v1/observations", headers=creator).json()] == [item["id"]]
        assert client.get("/api/v1/observations", headers=other_user).json() == []
        assert client.get("/api/v1/observations", headers=moderator).json()[0]["id"] == item["id"]

        reviewed = client.patch(
            f"/api/v1/observations/{item['id']}/status",
            headers=moderator,
            json={"status": "verified"},
        )
        assert reviewed.status_code == 200, reviewed.text
        assert reviewed.json()["status"] == "verified"
        assert client.get("/api/v1/observations?status=new", headers=creator).json() == []
    finally:
        with get_engine().begin() as connection:
            connection.execute(
                text("delete from field_observations where description = :description"),
                {"description": description},
            )
        cleanup()
