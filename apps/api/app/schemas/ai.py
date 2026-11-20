"""Validated API contracts for the Intelligence Engine."""

import re
from typing import Annotated, Literal, Union

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    TypeAdapter,
    field_validator,
)

MAX_ASSISTANT_ACTIONS = 6


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


class ClientPoint(StrictModel):
    """Position bornée fournie par le client (centre de caméra ou position)."""

    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lon: float = Field(ge=-180, le=180, allow_inf_nan=False)


class ClientCenter(ClientPoint):
    height: float | None = Field(default=None, allow_inf_nan=False)


class ClientContext(StrictModel):
    """Contexte d'écran transmis par le client pour situer la question.

    Tous les champs sont facultatifs afin qu'un client puisse n'envoyer que ce
    qu'il connaît. Le service le borne de nouveau avant tout prompt.
    """

    view: Literal["map", "globe"] | None = None
    tab: str | None = Field(default=None, max_length=32)
    selected_sensor: str | None = Field(default=None, max_length=64)
    center: ClientCenter | None = None
    layers: dict[str, bool] | None = None
    user_location: ClientPoint | None = None
    online: bool = True
    locale: Literal["fr", "en"] = "fr"

    @field_validator("layers")
    @classmethod
    def bounded_layers(cls, layers: dict[str, bool] | None) -> dict[str, bool] | None:
        if layers is None:
            return None
        if len(layers) > 20:
            raise ValueError("Au maximum 20 couches peuvent être décrites.")
        for key in layers:
            if not key or len(key) > 64 or any(ord(char) < 32 for char in key):
                raise ValueError("Un nom de couche est invalide.")
        return layers


class AssistantRequest(StrictModel):
    message: str = Field(min_length=1, max_length=2000)
    mode: Literal["answer", "report"] = "answer"
    surface: Literal["web", "gev"] = "web"
    external_consent: Literal[True]
    client_context: ClientContext | None = None
    allow_actions: bool = True

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


# --- Actions d'interface ----------------------------------------------------
# Contrat littéral consommé par le client web : chaque action est discriminée
# par `type`, tous les flottants sont finis, les clés inconnues sont refusées.


class FlyToAction(StrictModel):
    type: Literal["fly_to"]
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lon: float = Field(ge=-180, le=180, allow_inf_nan=False)
    height: float | None = Field(default=None, allow_inf_nan=False)
    label: str | None = Field(default=None, max_length=200)


class SetViewAction(StrictModel):
    type: Literal["set_view"]
    view: Literal["map", "globe"]


class OpenTabAction(StrictModel):
    type: Literal["open_tab"]
    tab: Literal[
        "carte", "capteurs", "alertes", "meteo", "observations", "ia", "gestion"
    ]


class SelectSensorAction(StrictModel):
    type: Literal["select_sensor"]
    code: str = Field(min_length=1, max_length=64)


class SetLayerAction(StrictModel):
    type: Literal["set_layer"]
    layer: Literal[
        "radar",
        "rain",
        "flood",
        "labels",
        "borders",
        "night",
        "aircraft",
        "sensors",
        "weather",
        "alerts",
        "traffic",
    ]
    enabled: bool


class SetBasemapAction(StrictModel):
    type: Literal["set_basemap"]
    basemap: Literal["osm", "esri", "nasa"]


class LocateUserAction(StrictModel):
    type: Literal["locate_user"]


class OpenSimulationAction(StrictModel):
    type: Literal["open_simulation"]
    mode: Literal["level", "rain", "sensor"]
    lat: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    lon: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)


class ZoomAction(StrictModel):
    type: Literal["zoom"]
    direction: Literal["in", "out"]


class ResetViewAction(StrictModel):
    type: Literal["reset_view"]


AssistantAction = Annotated[
    Union[
        FlyToAction,
        SetViewAction,
        OpenTabAction,
        SelectSensorAction,
        SetLayerAction,
        SetBasemapAction,
        LocateUserAction,
        OpenSimulationAction,
        ZoomAction,
        ResetViewAction,
    ],
    Field(discriminator="type"),
]

assistant_action_adapter: TypeAdapter[AssistantAction] = TypeAdapter(AssistantAction)
