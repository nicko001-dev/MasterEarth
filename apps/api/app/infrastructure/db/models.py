"""SQLAlchemy models for IntelliFlood database infrastructure.

This module contains base infrastructure models. Domain-specific models
(flood events, sensors, alerts, users, etc.) will be added in their
respective milestones (M2+).
"""

from sqlalchemy import Column, DateTime, Integer, func

from app.infrastructure.db.base import Base


class BaseModel(Base):
    """Abstract base model with common fields.

    Provides common columns like id and timestamps that all tables
    should have.
    """

    __abstract__ = True

    id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


# Domain models will be imported here as they are created in M2+
# from app.domain.flood.models import FloodEvent
# from app.domain.sensor.models import Sensor
# from app.domain.alert.models import Alert

# This ensures Base.metadata collects all models
__all__ = ["BaseModel"]


def register_domain_models() -> None:
    """Importe les modèles du domaine pour alimenter Base.metadata (Alembic)."""
    from app.domain import models  # noqa: F401
