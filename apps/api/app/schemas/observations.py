"""Schémas d'entrée des observations terrain."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

ObservationStatus = Literal["new", "in_review", "verified", "rejected"]


class ObservationCreate(BaseModel):
    observation_type: str = Field(min_length=1, max_length=64)
    description: str = Field(min_length=1, max_length=2000)
    observed_at: datetime
    lon: float = Field(ge=-180, le=180, allow_inf_nan=False)
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)

    @field_validator("observation_type", "description")
    @classmethod
    def trim_nonempty_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Ce champ ne peut pas être vide.")
        return value

    @field_validator("observed_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("La date doit inclure un fuseau horaire.")
        return value


class ObservationReview(BaseModel):
    status: ObservationStatus
