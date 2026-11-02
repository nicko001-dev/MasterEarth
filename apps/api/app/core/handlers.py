"""Global exception handlers for FastAPI.

Maps application exceptions, validation errors, and standard HTTP errors
to the standardized ErrorResponse envelope.
"""

from typing import Any, Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.core.exceptions import (
    AppException,
    AuthenticationError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
    RateLimitError,
    ValidationAppError,
)
from app.core.logging import logger, request_id_var
from app.schemas.common import ErrorDetail, ErrorResponse

EXCEPTION_STATUS_MAP: dict[type[AppException], int] = {
    NotFoundError: 404,
    ConflictError: 409,
    ValidationAppError: 422,
    AuthenticationError: 401,
    PermissionDeniedError: 403,
    RateLimitError: 429,
}

HTTP_STATUS_CODE_NAMES: dict[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    408: "REQUEST_TIMEOUT",
    409: "CONFLICT",
    410: "GONE",
    422: "UNPROCESSABLE_ENTITY",
    429: "TOO_MANY_REQUESTS",
    500: "INTERNAL_SERVER_ERROR",
    502: "BAD_GATEWAY",
    503: "SERVICE_UNAVAILABLE",
}


def get_current_request_id(request: Request) -> Optional[str]:
    """Retrieve the current request correlation ID from state or contextvar."""
    return getattr(request.state, "request_id", None) or request_id_var.get()


def get_status_code_for_app_exception(exc: AppException) -> int:
    """Resolve the appropriate HTTP status code for an AppException."""
    for exc_class, status_code in EXCEPTION_STATUS_MAP.items():
        if isinstance(exc, exc_class):
            return status_code
    return 500


def format_app_exception_details(details: Any) -> Optional[list[ErrorDetail]]:
    """Normalize exception details into a list of ErrorDetail instances."""
    if details is None:
        return None
    if isinstance(details, list):
        formatted: list[ErrorDetail] = []
        for item in details:
            if isinstance(item, ErrorDetail):
                formatted.append(item)
            elif isinstance(item, dict):
                formatted.append(
                    ErrorDetail(
                        field=item.get("field"),
                        message=str(item.get("message", "")),
                        code=item.get("code"),
                    )
                )
            else:
                formatted.append(ErrorDetail(message=str(item)))
        return formatted
    if isinstance(details, dict):
        return [
            ErrorDetail(
                field=details.get("field"),
                message=str(details.get("message", "")),
                code=details.get("code"),
            )
        ]
    return [ErrorDetail(message=str(details))]


def format_validation_errors(errors: list[dict[str, Any]]) -> list[ErrorDetail]:
    """Format Pydantic / FastAPI request validation error items."""
    details: list[ErrorDetail] = []
    for err in errors:
        loc = err.get("loc", ())
        field_parts = [str(part) for part in loc if part not in ("body",)]
        field = ".".join(field_parts) if field_parts else None
        details.append(
            ErrorDetail(
                field=field,
                message=err.get("msg", "Validation error."),
                code=err.get("type"),
            )
        )
    return details


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    """Handle custom application exceptions."""
    req_id = get_current_request_id(request)
    status_code = get_status_code_for_app_exception(exc)
    details = format_app_exception_details(exc.details)

    error_resp = ErrorResponse(
        status="error",
        code=exc.code,
        message=exc.message,
        details=details,
        request_id=req_id,
    )
    headers = {"X-Request-ID": req_id} if req_id else {}
    return JSONResponse(
        status_code=status_code,
        content=error_resp.model_dump(),
        headers=headers,
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Handle FastAPI / Pydantic request validation errors (HTTP 422)."""
    req_id = get_current_request_id(request)
    details = format_validation_errors(exc.errors())

    error_resp = ErrorResponse(
        status="error",
        code="VALIDATION_ERROR",
        message="Request validation failed.",
        details=details,
        request_id=req_id,
    )
    headers = {"X-Request-ID": req_id} if req_id else {}
    return JSONResponse(
        status_code=422,
        content=error_resp.model_dump(),
        headers=headers,
    )


async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    """Handle Starlette / FastAPI HTTPExceptions (404, 405, etc.)."""
    req_id = get_current_request_id(request)
    code = HTTP_STATUS_CODE_NAMES.get(exc.status_code, f"HTTP_{exc.status_code}")

    error_resp = ErrorResponse(
        status="error",
        code=code,
        message=str(exc.detail),
        details=None,
        request_id=req_id,
    )
    headers = {"X-Request-ID": req_id} if req_id else {}
    if exc.headers:
        headers.update(exc.headers)

    return JSONResponse(
        status_code=exc.status_code,
        content=error_resp.model_dump(),
        headers=headers,
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unexpected server exceptions (HTTP 500)."""
    req_id = get_current_request_id(request)
    logger.error(
        "Unhandled exception processing request [%s]: %s",
        req_id,
        exc,
        exc_info=True,
    )

    if settings.api_debug:
        message = f"Internal server error: {exc!s}"
        details = [ErrorDetail(message=str(exc), code="DEBUG_INFO")]
    else:
        message = "An unexpected server error occurred."
        details = None

    error_resp = ErrorResponse(
        status="error",
        code="INTERNAL_SERVER_ERROR",
        message=message,
        details=details,
        request_id=req_id,
    )
    headers = {"X-Request-ID": req_id} if req_id else {}
    return JSONResponse(
        status_code=500,
        content=error_resp.model_dump(),
        headers=headers,
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Register all global exception handlers on the FastAPI application."""
    app.add_exception_handler(AppException, app_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
