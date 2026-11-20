from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_check() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "MasterEarth API"}


def test_api_root() -> None:
    response = client.get("/api/v1")
    assert response.status_code == 200
    payload = response.json()
    assert payload["name"] == "MasterEarth API"
    assert payload["version"] == "v1"
    assert payload["status"] == "running"
    assert payload["app_env"] == "development"
