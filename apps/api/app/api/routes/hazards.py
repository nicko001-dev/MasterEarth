"""API v1 : aléas naturels réels agrégés et catalogue de simulation."""

from fastapi import APIRouter, HTTPException, Request, Response

from app.services import hazards

router = APIRouter(prefix="/api/v1/hazards", tags=["hazards"])


@router.get("")
def list_hazards(request: Request, response: Response) -> dict:
    """Événements naturels en cours, issus de sources publiques identifiées.

    Route de lecture, sans authentification ni écriture. Chaque source est
    interrogée indépendamment ; une panne est rapportée sans jamais être
    remplacée par une valeur inventée. Le cache serveur évite de solliciter
    les organismes émetteurs à chaque affichage.
    """
    client_host = request.client.host if request.client else "inconnu"
    if not hazards.allow_request(client_host):
        raise HTTPException(
            status_code=429,
            detail="Trop de requêtes sur les aléas : réessayez dans une minute.",
            headers={"Retry-After": "60"},
        )
    snapshot = hazards.load_snapshot()
    response.headers["Cache-Control"] = "public, max-age=45, stale-while-revalidate=60"
    return hazards.payload(snapshot)


@router.get("/catalog")
def hazard_catalog() -> dict:
    """Catalogue des aléas, de leurs sources et des paramètres de simulation."""
    return hazards.catalog_payload()
