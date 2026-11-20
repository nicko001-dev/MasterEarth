"""API v1 : couches d'observation en direct (trafic aérien, réseau routier)."""

from fastapi import APIRouter, HTTPException, Query, Request, Response

from app.core.exceptions import ValidationAppError
from app.services import aircraft, roads

router = APIRouter(prefix="/api/v1/live", tags=["live"])


@router.get("/aircraft/global")
def get_global_aircraft(request: Request) -> dict:
    """Trafic aérien réel sur toute la planète, pour la vue mondiale du globe.

    L'endpoint régional refuse les emprises trop grandes : sans cette route,
    l'ouverture du globe n'affichait donc aucun avion. Ici une seule requête
    OpenSky est mise en cache puis échantillonnée par secteur géographique, ce
    qui donne des appareils répartis sur tous les continents. Positions datées,
    interpolation côté client explicitement signalée.
    """
    client_host = request.client.host if request.client else "inconnu"
    if not aircraft.allow_request(client_host):
        raise HTTPException(
            status_code=429,
            detail="Trop de requêtes de trafic aérien : réessayez dans une minute.",
            headers={"Retry-After": "60"},
        )
    try:
        snapshot = aircraft.load_global_snapshot()
    except aircraft.AircraftUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return aircraft.global_payload(snapshot)


@router.get("/aircraft")
def get_aircraft(
    request: Request,
    west: float = Query(..., description="Longitude ouest de l'emprise (degrés)."),
    south: float = Query(..., description="Latitude sud de l'emprise (degrés)."),
    east: float = Query(..., description="Longitude est de l'emprise (degrés)."),
    north: float = Query(..., description="Latitude nord de l'emprise (degrés)."),
) -> dict:
    """Aéronefs observés dans l'emprise visible, via le proxy OpenSky.

    Route publique, sans authentification et sans écriture en base. Le serveur
    met en cache par emprise arrondie et limite le débit : le navigateur ne
    contacte jamais OpenSky. Les positions sont des observations datées ; le
    client peut les interpoler entre deux rafraîchissements en le signalant.
    """
    client_host = request.client.host if request.client else "inconnu"
    if not aircraft.allow_request(client_host):
        raise HTTPException(
            status_code=429,
            detail="Trop de requêtes de trafic aérien : réessayez dans une minute.",
            headers={"Retry-After": "60"},
        )
    try:
        snapshot = aircraft.load_snapshot(south, west, north, east)
    except ValidationAppError:
        raise
    except aircraft.AircraftUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return aircraft.payload(snapshot)


@router.get("/roads")
def get_roads(
    request: Request,
    response: Response,
    west: float = Query(..., description="Longitude ouest de l'emprise (degrés)."),
    south: float = Query(..., description="Latitude sud de l'emprise (degrés)."),
    east: float = Query(..., description="Longitude est de l'emprise (degrés)."),
    north: float = Query(..., description="Latitude nord de l'emprise (degrés)."),
) -> dict:
    """Réseau routier OpenStreetMap de l'emprise visible, pour le trafic animé.

    Route publique, sans authentification et sans écriture en base. Elle renvoie
    la géométrie des rues (données réelles, ODbL) : le client anime ensuite des
    véhicules le long de ces tracés, à partir de l'heure courante. Le mouvement
    est un modèle, jamais présenté comme une observation de trafic. Le serveur
    met en cache par emprise arrondie, réutilise un voisin déjà chargé et limite
    le débit : le navigateur ne contacte jamais Overpass.

    Overpass pouvant mettre plusieurs dizaines de secondes à répondre, la
    première demande renvoie **202** avec ``status = "loading"`` : le client
    réessaie quelques secondes plus tard et reçoit alors le tracé mis en cache.
    """
    client_host = request.client.host if request.client else "inconnu"
    if not roads.allow_request(client_host):
        raise HTTPException(
            status_code=429,
            detail="Trop de requêtes de réseau routier : réessayez dans une minute.",
            headers={"Retry-After": "60"},
        )
    try:
        snapshot, pending = roads.snapshot_or_start(south, west, north, east)
    except ValidationAppError:
        raise
    if snapshot is None:
        response.status_code = 202
        return {
            "status": "loading",
            "attribution": roads.ATTRIBUTION,
            "attribution_url": roads.ATTRIBUTION_URL,
            "license": roads.LICENSE,
            "count": 0,
            "roads": [],
            "limitations": list(roads.LIMITATIONS),
            "pending": pending,
        }
    body = roads.payload(snapshot)
    body["status"] = "ready"
    return body
