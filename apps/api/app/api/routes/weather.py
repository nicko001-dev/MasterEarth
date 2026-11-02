"""API v1 : météo (synthèse du risque pluie, collecte, saisie de bulletins)."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api import auth_deps
from app.domain.models import User
from app.domain.weather import WeatherPoint
from app.infrastructure.db.session import get_db_session
from app.services import accounts, weather

router = APIRouter(prefix="/api/v1/weather", tags=["weather"])


class BulletinIn(BaseModel):
    """Saisie manuelle d'une observation issue d'un bulletin officiel (SODEXAM, ONPC, station locale…)."""

    source: str = Field(min_length=2, max_length=32, pattern=r"^[a-z0-9_-]+$", examples=["sodexam"])
    name: str = Field(min_length=1, max_length=64)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    valid_at: datetime
    precip_mm: float = Field(ge=0, le=500, description="Cumul sur l'heure écoulée (mm).")


@router.get("")
def get_weather(db: Session = Depends(get_db_session)) -> list[dict]:
    return weather.summary(db)


@router.post("/refresh")
def refresh(actor: User = Depends(auth_deps.operator), db: Session = Depends(get_db_session)) -> dict:
    result = weather.refresh(db)
    accounts.audit(db, actor.email, "weather_refresh", str(result["points_ok"]) + " points", actor.id)
    return result


@router.post("/observations", status_code=201)
def add_bulletin(body: BulletinIn, actor: User = Depends(auth_deps.operator), db: Session = Depends(get_db_session)) -> dict:
    accounts.audit(db, actor.email, "weather_bulletin", f"{body.source}:{body.name}", actor.id)
    when = body.valid_at if body.valid_at.tzinfo else body.valid_at.replace(tzinfo=timezone.utc)
    point = WeatherPoint(valid_at=when, precip_mm=body.precip_mm, is_forecast=when > datetime.now(timezone.utc))
    return {"stored": weather.store(db, body.source, body.name, body.lat, body.lon, [point])}
