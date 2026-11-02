"""Application service providing system health and technical status."""

from app.config import settings
from app.schemas.system import ApiRootResponse, HealthResponse


class SystemService:
    """Handles system status and metadata reporting."""

    @staticmethod
    def get_health() -> HealthResponse:
        """Produce the current health status of the API service."""
        return HealthResponse(
            status="ok",
            service=settings.app_name,
        )

    @staticmethod
    def get_root_info() -> ApiRootResponse:
        """Produce the root metadata and runtime environment information."""
        return ApiRootResponse(
            name=settings.app_name,
            version="v1",
            status="running",
            app_env=settings.app_env,
        )


system_service = SystemService()
