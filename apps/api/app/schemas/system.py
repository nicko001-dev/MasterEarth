"""Pydantic schemas for technical and system endpoints."""

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Payload returned by the GET /health endpoint."""

    status: str
    service: str


class ApiRootResponse(BaseModel):
    """Payload returned by the GET /api/v1 technical root endpoint."""

    name: str
    version: str
    status: str
    app_env: str
