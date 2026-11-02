"""Data structures and validation schemas for the application."""

from app.schemas.common import ErrorDetail, ErrorResponse
from app.schemas.system import ApiRootResponse, HealthResponse

__all__ = ["HealthResponse", "ApiRootResponse", "ErrorDetail", "ErrorResponse"]
