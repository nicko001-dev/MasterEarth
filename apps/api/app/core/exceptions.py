"""Domain and application exceptions for MasterEarth.

These exceptions are framework-agnostic (pure Python) and do not depend
on FastAPI, Starlette, or SQLAlchemy.
"""

from typing import Any, Optional


class AppException(Exception):
    """Base exception for all application-level errors."""

    def __init__(
        self,
        message: str = "An internal error occurred.",
        code: str = "INTERNAL_ERROR",
        details: Optional[Any] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details


class NotFoundError(AppException):
    """Raised when a requested resource is not found."""

    def __init__(
        self,
        message: str = "Resource not found.",
        code: str = "NOT_FOUND",
        details: Optional[Any] = None,
    ) -> None:
        super().__init__(message=message, code=code, details=details)


class ConflictError(AppException):
    """Raised when an operation conflicts with the current resource state."""

    def __init__(
        self,
        message: str = "Resource conflict.",
        code: str = "CONFLICT",
        details: Optional[Any] = None,
    ) -> None:
        super().__init__(message=message, code=code, details=details)


class ValidationAppError(AppException):
    """Raised when input or domain validation fails."""

    def __init__(
        self,
        message: str = "Validation failed.",
        code: str = "VALIDATION_ERROR",
        details: Optional[Any] = None,
    ) -> None:
        super().__init__(message=message, code=code, details=details)


class AuthenticationError(AppException):
    """Raised when authentication fails or credentials are missing/invalid."""

    def __init__(
        self,
        message: str = "Authentication failed.",
        code: str = "AUTHENTICATION_FAILED",
        details: Optional[Any] = None,
    ) -> None:
        super().__init__(message=message, code=code, details=details)


class PermissionDeniedError(AppException):
    """Raised when the caller lacks required permissions."""

    def __init__(
        self,
        message: str = "Permission denied.",
        code: str = "PERMISSION_DENIED",
        details: Optional[Any] = None,
    ) -> None:
        super().__init__(message=message, code=code, details=details)


class RateLimitError(AppException):
    """Raised when a caller makes too many attempts."""

    def __init__(
        self,
        message: str = "Too many attempts.",
        code: str = "RATE_LIMITED",
        details: Optional[Any] = None,
    ) -> None:
        super().__init__(message=message, code=code, details=details)
