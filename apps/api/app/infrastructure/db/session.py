"""Database engine and session management for IntelliFlood.

This module provides the SQLAlchemy engine, session factory, and FastAPI
dependency injection for database sessions. It is designed to be imported
without immediately creating a database connection, allowing the application
to start without a live PostgreSQL server when database features are not used.
"""

from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

# Module-level engine and session factory (lazily initialized)
_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None


def get_engine() -> Engine:
    """Create or return the SQLAlchemy engine.

    The engine is created lazily on first access to allow the application
    to start without a database connection.
    """
    global _engine
    if _engine is None:
        _engine = create_engine(
            settings.database_url,
            pool_size=settings.postgres_pool_size,
            max_overflow=settings.postgres_max_overflow,
            pool_pre_ping=True,
            echo=settings.api_debug,
        )
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    """Create or return the session factory."""
    global _session_factory
    if _session_factory is None:
        _session_factory = sessionmaker(
            bind=get_engine(),
            autocommit=False,
            autoflush=False,
            expire_on_commit=False,
        )
    return _session_factory


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    """Provide a transactional scope around a series of operations.

    Comportement transactionnel :
        - Commit automatique si le bloc réussit (aucune exception levée).
        - Rollback automatique en cas d'exception, avec relance de l'exception levée.
        - Fermeture systématique de la session (session.close()) dans le
          bloc `finally` pour garantir la libération de la ressource.

    Usage:
        with session_scope() as session:
            session.add(some_model_instance)
            # Les modifications sont commitées automatiquement en sortie de bloc.
    """
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db_session() -> Generator[Session, None, None]:
    """FastAPI dependency that provides a database session.

    Usage in FastAPI routes:
        @router.get("/items")
        def get_items(db: Session = Depends(get_db_session)):
            ...
    """
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()


def init_db() -> None:
    """Initialize the database engine and session factory.

    This can be called during application startup to eagerly create
    the engine and verify the connection.
    """
    get_engine()
    get_session_factory()


def close_db() -> None:
    """Close the database engine and release connection pool resources."""
    global _engine, _session_factory
    if _engine is not None:
        _engine.dispose()
        _engine = None
        _session_factory = None
