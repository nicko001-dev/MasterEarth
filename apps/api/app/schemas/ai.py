"""Validated API contracts for the Intelligence Engine."""

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProviderCatalogRequest(StrictModel):
    api_key: str | None = Field(default=None, min_length=8, max_length=4096)


class ProviderConfigUpdate(StrictModel):
    api_key: str | None = Field(default=None, min_length=8, max_length=4096)
    selected_models: list[str] = Field(min_length=1, max_length=5)
    enabled: bool = True
    free_tier_confirmed: Literal[True]
    priority: int = Field(default=100, ge=1, le=500)

    @field_validator("selected_models")
    @classmethod
    def unique_models(cls, models: list[str]) -> list[str]:
        if len(set(models)) != len(models) or any(
            not model or len(model) > 160 or any(ord(char) < 32 for char in model)
            for model in models
        ):
            raise ValueError("La liste des modèles est invalide.")
        return models


class AssistantRequest(StrictModel):
    message: str = Field(min_length=1, max_length=2000)
    mode: Literal["answer", "report"] = "answer"
    surface: Literal["web", "gev"] = "web"
    external_consent: Literal[True]

    @field_validator("message")
    @classmethod
    def reject_common_personal_data(cls, message: str) -> str:
        message = message.strip()
        if not message:
            raise ValueError("La question ne peut pas être vide.")
        if re.search(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b", message):
            raise ValueError("Retirez les adresses e-mail avant l'envoi.")
        if re.search(r"(?<!\w)(?:\+?\d[\s().-]*){8,15}(?!\w)", message):
            raise ValueError("Retirez les numéros de téléphone avant l'envoi.")
        return message


class VisionRequest(StrictModel):
    question: str = Field(min_length=1, max_length=500)
    media_type: Literal["image/jpeg", "image/png", "image/webp"]
    image_base64: str = Field(min_length=1, max_length=5_600_000)
    external_consent: Literal[True]
