"""Architectural and unit tests for internal backend layers (M0.3)."""

from app.main import app
from app.schemas.system import ApiRootResponse, HealthResponse
from app.services.system import system_service


def test_system_service_health() -> None:
    health = system_service.get_health()
    assert isinstance(health, HealthResponse)
    assert health.status == "ok"
    assert health.service == "IntelliFlood API"


def test_system_service_root_info() -> None:
    root_info = system_service.get_root_info()
    assert isinstance(root_info, ApiRootResponse)
    assert root_info.version == "v1"
    assert root_info.status == "running"
    assert root_info.app_env in ["development", "test", "production"]


def test_api_routes_registered_in_openapi() -> None:
    openapi_paths = app.openapi()["paths"]
    assert "/health" in openapi_paths
    assert "/api/v1" in openapi_paths
