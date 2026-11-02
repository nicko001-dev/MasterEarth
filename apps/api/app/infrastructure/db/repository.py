"""Base repository pattern for data access in IntelliFlood.

This module provides a minimal, extensible base repository that encapsulates
common database operations. Domain-specific repositories (M2+) will extend
this base class.
"""

from typing import Generic, List, Optional, TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.infrastructure.db.models import BaseModel

T = TypeVar("T", bound=BaseModel)


class BaseRepository(Generic[T]):
    """Base repository providing common CRUD operations.

    This class encapsulates persistence logic and keeps database details
    out of services and routes. It is generic over the model type.

    Usage:
        class FloodEventRepository(BaseRepository[FloodEvent]):
            def __init__(self, db: Session):
                super().__init__(FloodEvent, db)
    """

    def __init__(self, model: type[T], db: Session):
        self.model = model
        self.db = db

    def get(self, id: int) -> Optional[T]:
        """Retrieve a single record by primary key."""
        return self.db.get(self.model, id)

    def get_all(self, limit: int = 100, offset: int = 0) -> List[T]:
        """Retrieve multiple records with pagination."""
        stmt = select(self.model).limit(limit).offset(offset)
        return list(self.db.execute(stmt).scalars().all())

    def create(self, obj: T) -> T:
        """Create a new record."""
        self.db.add(obj)
        self.db.flush()
        self.db.refresh(obj)
        return obj

    def update(self, obj: T) -> T:
        """Update an existing record."""
        self.db.merge(obj)
        self.db.flush()
        return obj

    def delete(self, id: int) -> bool:
        """Delete a record by primary key."""
        obj = self.get(id)
        if obj is None:
            return False
        self.db.delete(obj)
        return True

    def count(self) -> int:
        """Count total records."""
        from sqlalchemy import func

        stmt = select(func.count()).select_from(self.model)
        return self.db.execute(stmt).scalar_one()
