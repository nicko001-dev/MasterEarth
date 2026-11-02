"""API v1 : observations terrain authentifiées et revue par les opérateurs."""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api import auth_deps
from app.domain.models import User
from app.infrastructure.db.session import get_db_session
from app.schemas.observations import ObservationCreate, ObservationReview, ObservationStatus
from app.services import accounts, observations

router = APIRouter(prefix="/api/v1/observations", tags=["observations"])


@router.post("", status_code=201)
def create(
    body: ObservationCreate,
    actor: Optional[User] = Depends(auth_deps.optional_user),
    db: Session = Depends(get_db_session),
) -> dict:
    result = observations.create_observation(db, body, actor)
    actor_email = actor.email if actor else "citoyen_anonyme"
    actor_id = actor.id if actor else None
    accounts.audit(db, actor_email, "observation_created", str(result["id"]), actor_id)
    return result


@router.get("")
def list_items(
    limit: int = Query(100, ge=1, le=500),
    status: ObservationStatus | None = None,
    actor: Optional[User] = Depends(auth_deps.optional_user),
    db: Session = Depends(get_db_session),
) -> list[dict]:
    return observations.list_observations(db, actor, limit, status)


@router.patch("/{observation_id}/status")
def review(
    observation_id: int,
    body: ObservationReview,
    actor: User = Depends(auth_deps.operator),
    db: Session = Depends(get_db_session),
) -> dict:
    result = observations.review_observation(db, observation_id, actor, body.status)
    accounts.audit(
        db,
        actor.email,
        "observation_reviewed",
        f"{observation_id}: {body.status}",
        actor.id,
    )
    return result
