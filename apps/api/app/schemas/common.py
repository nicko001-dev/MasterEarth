"""Common Pydantic schemas for API errors and standardized responses."""

from typing import Optional

from pydantic import BaseModel, Field


class ErrorDetail(BaseModel):
    """Detailed error item, typically for field-level validation errors."""

    field: Optional[str] = Field(
        default=None, description="Field name where the error occurred."
    )
    message: str = Field(description="Human-readable description of the error.")
    code: Optional[str] = Field(
        default=None, description="Machine-readable error subtype code."
    )


class ErrorResponse(BaseModel):
    """Standardized JSON response envelope for all API errors."""

    status: str = Field(
        default="error", description="Status indicator, always 'error'."
    )
    code: str = Field(description="Machine-readable error identifier.")
    message: str = Field(description="Human-readable summary of the error.")
    details: Optional[list[ErrorDetail]] = Field(
        default=None, description="Optional list of error details."
    )
    request_id: Optional[str] = Field(
        default=None,
        description="Correlation identifier for request tracing.",
    )
