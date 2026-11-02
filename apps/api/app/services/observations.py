"""Cas d'usage des observations terrain et de leur visibilité."""

from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import Point
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.domain.models import FieldObservation, User
from app.schemas.observations import ObservationCreate


def _visible_to_user(statement, user: User | None):
    if user is None:
        return statement.where(FieldObservation.status == "verified")
    if user.role == "admin":
        return statement
    if user.role in ("operator", "agent_terrain") and user.organization_id is not None:
        return statement.where(FieldObservation.organization_id == user.organization_id)
    return statement.where(FieldObservation.created_by_user_id == user.id)


def _serialize(observation: FieldObservation) -> dict:
    point = to_shape(observation.location)
    return {
        "id": observation.id,
        "observation_type": observation.observation_type,
        "description": observation.description,
        "observed_at": observation.observed_at,
        "lon": point.x,
        "lat": point.y,
        "source": observation.source,
        "status": observation.status,
        "created_by_user_id": observation.created_by_user_id,
        "organization_id": observation.organization_id,
        "created_at": observation.created_at,
    }


def create_observation(db: Session, body: ObservationCreate, actor: User | None) -> dict:
    observation = FieldObservation(
        observation_type=body.observation_type,
        description=body.description,
        observed_at=body.observed_at,
        location=from_shape(Point(body.lon, body.lat), srid=4326),
        source="human",
        created_by_user_id=actor.id if actor else None,
        organization_id=actor.organization_id if actor else None,
    )
    db.add(observation)
    db.commit()
    db.refresh(observation)
    return _serialize(observation)


def list_observations(
    db: Session,
    actor: User | None,
    limit: int,
    status: str | None = None,
) -> list[dict]:
    statement = select(FieldObservation).order_by(
        FieldObservation.observed_at.desc(), FieldObservation.id.desc()
    )
    statement = _visible_to_user(statement, actor)
    if status is not None:
        statement = statement.where(FieldObservation.status == status)
    statement = statement.limit(limit)
    return [_serialize(item) for item in db.execute(statement).scalars()]


def review_observation(
    db: Session,
    observation_id: int,
    actor: User,
    status: str,
) -> dict:
    statement = _visible_to_user(
        select(FieldObservation).where(FieldObservation.id == observation_id),
        actor,
    )
    observation = db.execute(statement).scalar_one_or_none()
    if observation is None:
        raise NotFoundError("Observation introuvable.", code="OBSERVATION_NOT_FOUND")
    observation.status = status
    db.commit()
    db.refresh(observation)
    return _serialize(observation)
