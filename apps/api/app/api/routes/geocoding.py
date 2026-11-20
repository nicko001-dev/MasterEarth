"""API v1 : géocodage et recherche de lieux (mondial)."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.api import auth_deps
from app.domain.models import User
from app.services import geocoding

router = APIRouter(prefix="/api/v1/geocoding", tags=["geocoding"])


@router.get("/search")
def search_places(
    request: Request,
    q: str = Query(
        ...,
        min_length=1,
        max_length=100,
        description="Terme de recherche (ville, quartier, région, pays)",
    ),
    limit: int = Query(10, ge=1, le=25),
    lang: str = Query("fr", min_length=2, max_length=5),
    _: User = Depends(auth_deps.current_user),
) -> dict:
    """Recherche de lieux dans le monde entier.

    Réponse : ``{"places": [...], "degraded": bool, "attribution": str, ...}``.
    ``degraded=True`` signale un repli local (Photon injoignable), pas une
    absence de résultat.
    """
    client_host = request.client.host if request.client else "inconnu"
    if not geocoding.allow_request(client_host):
        raise HTTPException(status_code=429, detail="Trop de recherches ; réessayez dans une minute.")

    result = geocoding.search(q, limit, language=lang)
    return {
        "places": list(result.places),
        "degraded": result.degraded,
        "source": result.source,
        "attribution": geocoding.ATTRIBUTION,
        "attribution_url": geocoding.ATTRIBUTION_URL,
        "license": geocoding.LICENSE,
        "limitations": list(geocoding.LIMITATIONS),
    }


@router.get("/reverse")
def reverse_geocode(
    request: Request,
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    lang: str = Query("fr", min_length=2, max_length=5),
    _: User = Depends(auth_deps.current_user),
) -> dict:
    """Géocodage inverse mondial : lieu le plus proche des coordonnées données."""
    client_host = request.client.host if request.client else "inconnu"
    if not geocoding.allow_request(client_host):
        raise HTTPException(status_code=429, detail="Trop de recherches ; réessayez dans une minute.")

    return geocoding.reverse(lat, lon, language=lang)
