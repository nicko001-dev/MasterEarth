"""Tests for M2.1 Core transversal backend foundations.

Covers:
- Application exceptions hierarchy and attributes
- Error response schemas and global exception handlers
- HTTP status preservation (404, 405, 500)
- X-Request-ID middleware generation, validation, and isolation
- Application lifespan management and cleanup
- Non-regression of existing endpoints
"""

import uuid
from typing import Generator
from unittest.mock import patch

import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.config import settings
from app.core.exceptions import (
    AppException,
    AuthenticationError,
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
    ValidationAppError,
)
from app.core.handlers import get_status_code_for_app_exception
from app.core.logging import (
    LOGGER_NAME,
    get_logger,
    request_id_var,
    setup_logging,
)
from app.core.middleware import (
    MAX_REQUEST_ID_LENGTH,
    REQUEST_ID_HEADER,
    is_valid_request_id,
    resolve_request_id,
)
from app.infrastructure.db.session import close_db
from app.main import app, lifespan

# Register a dedicated test router on the existing application for error scenarios
core_errors_router = APIRouter(prefix="/test-core-errors")


class SampleBody(BaseModel):
    name: str
    amount: int


@core_errors_router.get("/not-found")
def route_not_found():
    raise NotFoundError("Requested entity does not exist.", code="ENTITY_NOT_FOUND")


@core_errors_router.get("/conflict")
def route_conflict():
    raise ConflictError("Entity with this key already exists.", code="KEY_EXISTS")


@core_errors_router.get("/validation-app")
def route_validation_app():
    raise ValidationAppError(
        "Business invariant violated.",
        code="INVARIANT_VIOLATION",
        details=[{"field": "amount", "message": "Amount must be strictly positive."}],
    )


@core_errors_router.get("/auth-error")
def route_auth_error():
    raise AuthenticationError(
        "Invalid or expired credentials.", code="INVALID_CREDENTIALS"
    )


@core_errors_router.get("/permission-error")
def route_permission_error():
    raise PermissionDeniedError(
        "Access denied to the specified zone.", code="ZONE_ACCESS_DENIED"
    )


@core_errors_router.post("/validation-request")
def route_validation_request(body: SampleBody):
    return {"received": body.name}


@core_errors_router.get("/unhandled-500")
def route_unhandled_500():
    raise RuntimeError("Unexpected failure during processing.")


# Mount the test routes once on the application
app.include_router(core_errors_router)


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """Test client configured to prevent unhandled 500s from re-raising."""
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


# =============================================================================
# 1. Exceptions Hierarchy & Attributes
# =============================================================================


def test_exception_inheritance() -> None:
    """Verify that all custom exceptions inherit from AppException and Exception."""
    assert issubclass(AppException, Exception)
    for exc_cls in [
        NotFoundError,
        ConflictError,
        ValidationAppError,
        AuthenticationError,
        PermissionDeniedError,
    ]:
        assert issubclass(exc_cls, AppException)


def test_exception_default_codes_and_messages() -> None:
    """Verify standard default codes and messages on exception classes."""
    nf = NotFoundError()
    assert nf.code == "NOT_FOUND"
    assert "Resource not found" in nf.message

    cf = ConflictError()
    assert cf.code == "CONFLICT"
    assert "Resource conflict" in cf.message

    ve = ValidationAppError()
    assert ve.code == "VALIDATION_ERROR"
    assert "Validation failed" in ve.message

    ae = AuthenticationError()
    assert ae.code == "AUTHENTICATION_FAILED"
    assert "Authentication failed" in ae.message

    pe = PermissionDeniedError()
    assert pe.code == "PERMISSION_DENIED"
    assert "Permission denied" in pe.message


def test_exception_custom_code_message_and_details() -> None:
    """Verify custom attributes passed to exceptions."""
    details = [{"field": "email", "message": "Email is already taken"}]
    exc = ConflictError(
        message="Custom conflict", code="CUSTOM_CONFLICT", details=details
    )
    assert exc.message == "Custom conflict"
    assert exc.code == "CUSTOM_CONFLICT"
    assert exc.details == details


def test_status_code_mapping() -> None:
    """Verify get_status_code_for_app_exception returns expected HTTP codes."""
    assert get_status_code_for_app_exception(NotFoundError()) == 404
    assert get_status_code_for_app_exception(ConflictError()) == 409
    assert get_status_code_for_app_exception(ValidationAppError()) == 422
    assert get_status_code_for_app_exception(AuthenticationError()) == 401
    assert get_status_code_for_app_exception(PermissionDeniedError()) == 403
    assert get_status_code_for_app_exception(AppException()) == 500


# =============================================================================
# 2. Error Responses & Global Exception Handlers
# =============================================================================


def test_not_found_error_handler(client: TestClient) -> None:
    """Verify NotFoundError yields HTTP 404 with ErrorResponse schema."""
    resp = client.get("/test-core-errors/not-found")
    assert resp.status_code == 404
    assert REQUEST_ID_HEADER in resp.headers

    data = resp.json()
    assert data["status"] == "error"
    assert data["code"] == "ENTITY_NOT_FOUND"
    assert data["message"] == "Requested entity does not exist."
    assert data["request_id"] == resp.headers[REQUEST_ID_HEADER]


def test_conflict_error_handler(client: TestClient) -> None:
    """Verify ConflictError yields HTTP 409 with ErrorResponse schema."""
    resp = client.get("/test-core-errors/conflict")
    assert resp.status_code == 409
    assert REQUEST_ID_HEADER in resp.headers

    data = resp.json()
    assert data["status"] == "error"
    assert data["code"] == "KEY_EXISTS"
    assert data["message"] == "Entity with this key already exists."


def test_validation_app_error_handler(client: TestClient) -> None:
    """Verify ValidationAppError yields HTTP 422 with details list."""
    resp = client.get("/test-core-errors/validation-app")
    assert resp.status_code == 422

    data = resp.json()
    assert data["status"] == "error"
    assert data["code"] == "INVARIANT_VIOLATION"
    assert data["message"] == "Business invariant violated."
    assert len(data["details"]) == 1
    assert data["details"][0]["field"] == "amount"


def test_authentication_error_handler(client: TestClient) -> None:
    """Verify AuthenticationError yields HTTP 401."""
    resp = client.get("/test-core-errors/auth-error")
    assert resp.status_code == 401

    data = resp.json()
    assert data["status"] == "error"
    assert data["code"] == "INVALID_CREDENTIALS"


def test_permission_denied_error_handler(client: TestClient) -> None:
    """Verify PermissionDeniedError yields HTTP 403."""
    resp = client.get("/test-core-errors/permission-error")
    assert resp.status_code == 403

    data = resp.json()
    assert data["status"] == "error"
    assert data["code"] == "ZONE_ACCESS_DENIED"


def test_request_validation_error_handler(client: TestClient) -> None:
    """Verify FastAPI Pydantic validation errors yield HTTP 422 with details."""
    resp = client.post(
        "/test-core-errors/validation-request",
        json={"name": "test", "amount": "not-an-integer"},
    )
    assert resp.status_code == 422
    assert REQUEST_ID_HEADER in resp.headers

    data = resp.json()
    assert data["status"] == "error"
    assert data["code"] == "VALIDATION_ERROR"
    assert "Request validation failed" in data["message"]
    assert len(data["details"]) >= 1
    assert any(d["field"] == "amount" for d in data["details"])


def test_preserves_standard_404(client: TestClient) -> None:
    """Verify nonexistent routes yield HTTP 404 with ErrorResponse envelope."""
    resp = client.get("/nonexistent-endpoint-404")
    assert resp.status_code == 404
    assert REQUEST_ID_HEADER in resp.headers

    data = resp.json()
    assert data["status"] == "error"
    assert data["code"] == "NOT_FOUND"


def test_preserves_standard_405(client: TestClient) -> None:
    """Verify method not allowed yields HTTP 405 with ErrorResponse envelope."""
    resp = client.post("/health")
    assert resp.status_code == 405
    assert REQUEST_ID_HEADER in resp.headers

    data = resp.json()
    assert data["status"] == "error"
    assert data["code"] == "METHOD_NOT_ALLOWED"


def test_unhandled_500_production_mode(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verify unhandled errors yield HTTP 500 without leaking details in prod."""
    monkeypatch.setattr(settings, "api_debug", False)

    resp = client.get("/test-core-errors/unhandled-500")
    assert resp.status_code == 500
    assert REQUEST_ID_HEADER in resp.headers

    data = resp.json()
    assert data["status"] == "error"
    assert data["code"] == "INTERNAL_SERVER_ERROR"
    assert data["message"] == "An unexpected server error occurred."
    assert data["details"] is None


def test_unhandled_500_debug_mode(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Verify unhandled exceptions in debug mode surface controlled diagnostic info."""
    monkeypatch.setattr(settings, "api_debug", True)

    resp = client.get("/test-core-errors/unhandled-500")
    assert resp.status_code == 500
    assert REQUEST_ID_HEADER in resp.headers

    data = resp.json()
    assert data["status"] == "error"
    assert data["code"] == "INTERNAL_SERVER_ERROR"
    assert "Unexpected failure" in data["message"]
    assert data["details"] is not None


# =============================================================================
# 3. Request ID Validation, Middleware & Isolation
# =============================================================================


def test_is_valid_request_id() -> None:
    """Test validation of client-supplied request IDs."""
    assert is_valid_request_id("valid-id-123_abc")
    assert is_valid_request_id("REQ_001")
    assert not is_valid_request_id("")
    assert not is_valid_request_id(None)
    assert not is_valid_request_id("id with spaces")
    assert not is_valid_request_id("id;drop table")
    assert not is_valid_request_id("<script>")
    assert not is_valid_request_id("a" * (MAX_REQUEST_ID_LENGTH + 1))


def test_resolve_request_id() -> None:
    """Verify resolve_request_id preserves valid IDs and regenerates on invalid."""
    valid_id = "client-req-id-01"
    assert resolve_request_id(valid_id) == valid_id

    generated = resolve_request_id("invalid id with spaces")
    assert generated != "invalid id with spaces"
    assert uuid.UUID(generated)  # valid UUID4


def test_request_id_present_on_normal_response(client: TestClient) -> None:
    """Verify X-Request-ID header is present on 200 OK responses."""
    resp = client.get("/health")
    assert resp.status_code == 200
    assert REQUEST_ID_HEADER in resp.headers
    assert is_valid_request_id(resp.headers[REQUEST_ID_HEADER])


def test_request_id_preserved_when_valid_client_header(
    client: TestClient,
) -> None:
    """Verify a valid client-supplied X-Request-ID is retained."""
    custom_id = "trace-client-12345"
    resp = client.get("/health", headers={REQUEST_ID_HEADER: custom_id})
    assert resp.status_code == 200
    assert resp.headers[REQUEST_ID_HEADER] == custom_id


def test_request_id_replaced_when_client_header_invalid(
    client: TestClient,
) -> None:
    """Verify an invalid client-supplied X-Request-ID is replaced by a server UUID."""
    bad_id = "invalid id with spaces && illegal characters"
    resp = client.get("/health", headers={REQUEST_ID_HEADER: bad_id})
    assert resp.status_code == 200
    returned_id = resp.headers[REQUEST_ID_HEADER]
    assert returned_id != bad_id
    assert is_valid_request_id(returned_id)


def test_request_id_replaced_when_client_header_too_long(
    client: TestClient,
) -> None:
    """Verify an overly long client-supplied ID is replaced."""
    long_id = "a" * (MAX_REQUEST_ID_LENGTH + 10)
    resp = client.get("/health", headers={REQUEST_ID_HEADER: long_id})
    assert resp.status_code == 200
    assert resp.headers[REQUEST_ID_HEADER] != long_id
    assert is_valid_request_id(resp.headers[REQUEST_ID_HEADER])


def test_request_id_isolation_between_requests(client: TestClient) -> None:
    """Verify consecutive requests receive distinct correlation IDs."""
    resp1 = client.get("/health")
    resp2 = client.get("/health")
    id1 = resp1.headers[REQUEST_ID_HEADER]
    id2 = resp2.headers[REQUEST_ID_HEADER]
    assert id1 != id2


# =============================================================================
# 4. Centralized Logging & Idempotency
# =============================================================================


def test_setup_logging_idempotency() -> None:
    """Verify setup_logging can be called repeatedly without duplicating handlers."""
    logger1 = setup_logging()
    handler_count1 = len(logger1.handlers)

    logger2 = setup_logging()
    handler_count2 = len(logger2.handlers)

    assert logger1 is logger2
    assert handler_count1 == handler_count2
    assert handler_count1 >= 1


def test_get_logger_namespacing() -> None:
    """Verify get_logger scopes correctly under intelliflood root."""
    root_log = get_logger()
    assert root_log.name == LOGGER_NAME

    child_log = get_logger("core")
    assert child_log.name == f"{LOGGER_NAME}.core"


def test_logging_contextvar_isolation() -> None:
    """Verify request_id_var can be set and reset cleanly."""
    token = request_id_var.set("test-ctx-123")
    assert request_id_var.get() == "test-ctx-123"
    request_id_var.reset(token)
    assert request_id_var.get() is None


# =============================================================================
# 5. Application Lifecycle & Database Teardown
# =============================================================================


@pytest.mark.anyio
async def test_lifespan_invokes_close_db() -> None:
    """Verify the lifespan context manager calls close_db on shutdown."""
    with patch("app.main.close_db") as mock_close:
        async with lifespan(app):
            pass
        mock_close.assert_called_once()


def test_close_db_is_safe_and_idempotent() -> None:
    """Verify close_db can be called multiple times without error."""
    close_db()
    close_db()
    close_db()


# =============================================================================
# 6. Non-Regression on Existing Endpoints
# =============================================================================


def test_non_regression_health_endpoint(client: TestClient) -> None:
    """Ensure GET /health maintains its exact M0.1/M1 contract."""
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "service": "MasterEarth API"}


def test_non_regression_api_root_endpoint(client: TestClient) -> None:
    """Ensure GET /api/v1 maintains its exact M0.1/M1 contract."""
    resp = client.get("/api/v1")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["name"] == "MasterEarth API"
    assert payload["version"] == "v1"
    assert payload["status"] == "running"
    assert payload["app_env"] in ["development", "test", "production"]
