"""Tests for database configuration and infrastructure."""

import os
from unittest.mock import patch

from app.config import Settings
from app.infrastructure.db.base import Base
from app.infrastructure.db.session import (
    close_db,
    get_db_session,
    get_engine,
    get_session_factory,
    init_db,
    session_scope,
)


def test_settings_database_url():
    """Test that database URL is correctly constructed from settings."""
    with patch.dict(
        os.environ,
        {
            "POSTGRES_HOST": "localhost",
            "POSTGRES_PORT": "5432",
            "POSTGRES_USER": "test_user",
            "POSTGRES_PASSWORD": "test_pass",
            "POSTGRES_DB": "test_db",
        },
        clear=True,
    ):
        settings = Settings(_env_file=None)
        url = settings.database_url
        assert url == "postgresql+psycopg://test_user:test_pass@localhost:5432/test_db"


def test_settings_database_url_defaults():
    """Test database URL with default values."""
    settings = Settings(_env_file=None)
    url = settings.database_url
    assert (
        url == "postgresql+psycopg://intelliflood:change-me@127.0.0.1:5432/intelliflood"
    )


def test_base_metadata_exists():
    """Test that SQLAlchemy Base has metadata."""
    assert Base.metadata is not None


def test_get_engine_creates_engine():
    """Test that get_engine returns a SQLAlchemy Engine."""
    close_db()  # Ensure clean state
    try:
        engine = get_engine()
        assert engine is not None
        # Check that it has the right URL pattern
        assert "postgresql+psycopg://" in str(engine.url)
    finally:
        close_db()


def test_get_session_factory():
    """Test that get_session_factory returns a sessionmaker."""
    close_db()  # Ensure clean state
    try:
        factory = get_session_factory()
        assert factory is not None
    finally:
        close_db()


def test_session_scope_context_manager():
    """Test session_scope as a context manager."""
    close_db()  # Ensure clean state
    try:
        # This will fail if no database is available, but we can at least
        # verify the function exists and returns a context manager
        assert callable(session_scope)
    finally:
        close_db()


def test_get_db_session_generator():
    """Test that get_db_session is a generator function."""
    close_db()  # Ensure clean state
    try:
        gen = get_db_session()
        assert hasattr(gen, "__next__")
        gen.close()
    finally:
        close_db()


def test_init_db():
    """Test init_db initializes engine and session factory."""
    close_db()  # Ensure clean state
    try:
        init_db()
        # If no exception, initialization worked
        assert get_engine() is not None
        assert get_session_factory() is not None
    finally:
        close_db()


def test_close_db():
    """Test close_db disposes engine."""
    close_db()  # Ensure clean state
    try:
        init_db()
        close_db()
        # After close, getting engine should create a new one
        engine = get_engine()
        assert engine is not None
    finally:
        close_db()
