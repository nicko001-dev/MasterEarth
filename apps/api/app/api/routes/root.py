"""Root API technical route."""

from fastapi import APIRouter

from app.schemas.system import ApiRootResponse
from app.services.system import system_service

router = APIRouter()


@router.get("/api/v1", response_model=ApiRootResponse, tags=["system"])
def api_root() -> ApiRootResponse:
    """Return technical metadata and environment info for API v1."""
    return system_service.get_root_info()
