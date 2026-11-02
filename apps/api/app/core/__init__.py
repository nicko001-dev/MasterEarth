"""Core application layer for IntelliFlood.

Houses cross-cutting concerns, application configuration, logging,
error handling, and shared infrastructure utilities for the backend.
"""

from app.config import Settings, settings
from app.core.exceptions import (
    AppException,
    AuthenticationError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
    ValidationAppError,
)
from app.core.handlers import register_exception_handlers
from app.core.logging import get_logger, logger, request_id_var, setup_logging
from app.core.middleware import RequestIDMiddleware

__all__ = [
    "Settings",
    "settings",
    "AppException",
    "NotFoundError",
    "ConflictError",
    "ValidationAppError",
    "AuthenticationError",
    "PermissionDeniedError",
    "register_exception_handlers",
    "logger",
    "get_logger",
    "setup_logging",
    "request_id_var",
    "RequestIDMiddleware",
]
