"""Centralized logging configuration for MasterEarth."""

import logging
from contextvars import ContextVar
from typing import Optional

from app.config import settings

LOGGER_NAME = "intelliflood"

# ContextVar for request tracing across async tasks without shared global state
request_id_var: ContextVar[Optional[str]] = ContextVar("request_id", default=None)


class RequestIDFilter(logging.Filter):
    """Logging filter that injects the current request ID into log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get() or "-"
        return True


def get_logger(name: Optional[str] = None) -> logging.Logger:
    """Return a scoped logger under the intelliflood hierarchy."""
    if name:
        return logging.getLogger(f"{LOGGER_NAME}.{name}")
    return logging.getLogger(LOGGER_NAME)


def setup_logging() -> logging.Logger:
    """Configure the intelliflood application logger.

    Safe and idempotent: avoids duplicate handlers if called multiple times.
    Log level is driven by settings.api_debug (DEBUG when True, INFO otherwise).
    """
    app_logger = logging.getLogger(LOGGER_NAME)
    log_level = logging.DEBUG if settings.api_debug else logging.INFO
    app_logger.setLevel(log_level)

    # If handlers already exist, update their level and return
    if app_logger.handlers:
        for handler in app_logger.handlers:
            handler.setLevel(log_level)
        return app_logger

    handler = logging.StreamHandler()
    handler.setLevel(log_level)
    handler.addFilter(RequestIDFilter())

    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] [%(name)s] [%(request_id)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)
    app_logger.addHandler(handler)
    app_logger.propagate = False

    return app_logger


logger = get_logger()
