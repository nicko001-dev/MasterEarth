"""HTTP middleware for request tracing and correlation."""

import re
import uuid
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import request_id_var

REQUEST_ID_HEADER = "X-Request-ID"
MAX_REQUEST_ID_LENGTH = 64
VALID_REQUEST_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_\-]+$")


def is_valid_request_id(value: Optional[str]) -> bool:
    """Validate client-supplied request ID.

    Must be non-empty, alphanumeric with hyphens/underscores,
    and at most 64 characters long.
    """
    if not value or len(value) > MAX_REQUEST_ID_LENGTH:
        return False
    return bool(VALID_REQUEST_ID_PATTERN.match(value))


def resolve_request_id(client_id: Optional[str]) -> str:
    """Return client request ID if valid; otherwise generate a UUID4 string."""
    if is_valid_request_id(client_id):
        return client_id  # type: ignore[return-value]
    return str(uuid.uuid4())


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Middleware attaching a correlation ID to every incoming and outgoing request.

    - Inspects incoming X-Request-ID header.
    - If valid, preserves it; otherwise generates a server-side UUID4.
    - Stores the ID in request.state.request_id and the logging contextvar.
    - Ensures outgoing response always contains the X-Request-ID header.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        client_req_id = request.headers.get(REQUEST_ID_HEADER)
        req_id = resolve_request_id(client_req_id)

        request.state.request_id = req_id
        token = request_id_var.set(req_id)
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)

        response.headers[REQUEST_ID_HEADER] = req_id
        return response
