"""Health check route."""

from fastapi import APIRouter

from app.schemas.system import HealthResponse
from app.services.system import system_service

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["health"])
def health_check() -> HealthResponse:
    """Return service liveness and health status."""
    return system_service.get_health()
