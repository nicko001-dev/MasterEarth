"""API v1 : météo (synthèse du risque pluie, collecte, saisie de bulletins)."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.api import auth_deps
from app.core.exceptions import NotFoundError, ValidationAppError
from app.domain.models import User
from app.domain.weather import WeatherPoint
from app.infrastructure.db.session import get_db_session
from app.services import accounts, global_rain, radar, weather, weather_viewport

router = APIRouter(prefix="/api/v1/weather", tags=["weather"])


class BulletinIn(BaseModel):
    """Saisie manuelle d'une observation issue d'un bulletin officiel (SODEXAM, ONPC, station locale…)."""

    source: str = Field(min_length=2, max_length=32, pattern=r"^[a-z0-9_-]+$", examples=["sodexam"])
    name: str = Field(min_length=1, max_length=64)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    valid_at: datetime
    precip_mm: float = Field(ge=0, le=500, description="Cumul sur l'heure écoulée (mm).")

    @field_validator("source")
    @classmethod
    def reject_reserved_source(cls, value: str) -> str:
        if value in {"open-meteo", "openweather", "iot-rain-gauge"}:
            raise ValueError("Cette source est réservée à son connecteur dédié.")
        return value


@router.get("")
def get_weather(db: Session = Depends(get_db_session)) -> list[dict]:
    return weather.summary(db)


@router.get("/status")
def get_weather_status(db: Session = Depends(get_db_session)) -> dict:
    return weather.source_status(db)


@router.get("/viewport")
def get_weather_viewport(
    request: Request,
    west: float = Query(..., description="Longitude ouest de l'emprise (degrés)."),
    south: float = Query(..., description="Latitude sud de l'emprise (degrés)."),
    east: float = Query(..., description="Longitude est de l'emprise (degrés)."),
    north: float = Query(..., description="Latitude nord de l'emprise (degrés)."),
) -> dict:
    """Échantillonne Open-Meteo pour l'emprise visible, dans le monde entier.

    Route publique, sans authentification et sans écriture en base. La
    validation métier (bornes, ordre, aire maximale) et l'échantillonnage
    appartiennent au service.
    """
    client_host = request.client.host if request.client else "inconnu"
    if not weather_viewport.allow_request(client_host):
        raise HTTPException(
            status_code=429,
            detail="Trop de requêtes météo : réessayez dans une minute.",
            headers={"Retry-After": "60"},
        )
    return weather_viewport.sample_viewport(south, west, north, east)


@router.get("/global-rain")
def get_global_rain(request: Request) -> dict:
    """Compte honnête des points en pluie dans le monde entier, avec lieux nommés.

    Route publique, sans authentification et sans écriture en base. Un balayage
    de 198 points est fait chez Open-Meteo ; jusqu'à 8 zones arrosées sont
    ensuite affinées par des sondages rapprochés puis géocodées en parallèle
    (rue, quartier ou localité) dans ``rain_places``. Seuls des points nommés
    sont rendus, jamais une trame de fond ni des cellules.
    Les points en échec restent *inconnus* et ne sont jamais comptés comme
    secs. Quand aucune valeur n'est exploitable, ``available`` vaut false et
    ``rain_points`` est ``null`` : l'interface affiche alors « données
    indisponibles » au lieu d'un zéro trompeur.
    """
    client_host = request.client.host if request.client else "inconnu"
    if not global_rain.allow_request(client_host):
        raise HTTPException(
            status_code=429,
            detail="Trop de scans de pluie mondiale : réessayez dans une minute.",
            headers={"Retry-After": "60"},
        )
    try:
        snapshot = global_rain.scan()
    except global_rain.GlobalRainUnavailable:
        return global_rain.unavailable_payload()
    return global_rain.payload(snapshot)


@router.get("/radar/frames")
def get_radar_frames() -> dict:
    """Liste des images du radar mondial RainViewer, via le proxy MasterEarth.

    Route publique, sans authentification et sans accès base. Les tuiles de
    chaque image doivent être demandées à
    `/api/v1/weather/radar/tiles/{index}/{z}/{x}/{y}.png`, avec l'`index`
    renvoyé ici (et non le chemin du fournisseur).
    """
    try:
        product = radar.load_frames()
    except radar.RadarUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return radar.frames_payload(product)


@router.get("/radar/tiles/{index}/{z}/{x}/{y}.png")
def get_radar_tile(
    request: Request, index: int, z: int, x: int, y: int
) -> Response:
    """Sert une tuile PNG du radar mondial depuis le cache du serveur.

    Route publique, sans authentification et sans accès base. Le proxy existe
    parce que le navigateur ne peut pas charger les tuiles RainViewer
    directement (CORS) ; il permet aussi de mettre en cache et de limiter le
    débit. La validation des coordonnées et la construction de l'URL amont
    appartiennent au service.
    """
    client_host = request.client.host if request.client else "inconnu"
    if not radar.allow_request(client_host):
        raise HTTPException(
            status_code=429,
            detail="Trop de requêtes radar : réessayez dans une minute.",
            headers={"Retry-After": "60"},
        )
    try:
        radar.validate_tile_coordinates(z, x, y)
    except ValueError as exc:
        raise ValidationAppError(str(exc)) from exc

    try:
        product = radar.load_frames()
    except radar.RadarUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if index < 0:
        raise ValidationAppError("Index d'image radar invalide.")
    if index >= len(product.frames):
        raise NotFoundError(
            "Image radar inconnue : demandez la liste des images disponibles."
        )

    try:
        png, media_type = radar.fetch_tile(product, index, z, x, y)
    except radar.RadarUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return Response(
        content=png,
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=600"},
    )


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
