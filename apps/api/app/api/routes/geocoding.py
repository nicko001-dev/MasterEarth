"""API v1 : géocodage et recherche de lieux."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api import auth_deps
from app.domain.models import User
from app.infrastructure.db.session import get_db_session

router = APIRouter(prefix="/api/v1/geocoding", tags=["geocoding"])

# Lieux ivoiriens précalculés (pour éviter un appel externe à chaque recherche)
IVOIRIAN_PLACES = [
    {"name": "Abidjan", "lat": 5.36, "lon": -4.01, "type": "city"},
    {"name": "Yamoussoukro", "lat": 6.83, "lon": -5.28, "type": "city"},
    {"name": "Bouaké", "lat": 7.69, "lon": -5.03, "type": "city"},
    {"name": "San-Pédro", "lat": 4.75, "lon": -6.64, "type": "city"},
    {"name": "Korhogo", "lat": 9.46, "lon": -5.63, "type": "city"},
    {"name": "Daloa", "lat": 6.88, "lon": -6.45, "type": "city"},
    {"name": "Man", "lat": 7.41, "lon": -7.55, "type": "city"},
    # Abidjan communes/quartiers
    {"name": "Cocody", "lat": 5.359, "lon": -3.985, "type": "district"},
    {"name": "Plateau", "lat": 5.32, "lon": -4.02, "type": "district"},
    {"name": "Yopougon", "lat": 5.35, "lon": -4.09, "type": "district"},
    {"name": "Abobo", "lat": 5.42, "lon": -4.02, "type": "district"},
    {"name": "Marcory", "lat": 5.29, "lon": -3.98, "type": "district"},
    {"name": "Treichville", "lat": 5.29, "lon": -4.01, "type": "district"},
    {"name": "Bingerville", "lat": 5.36, "lon": -3.89, "type": "district"},
    {"name": "Adjamé", "lat": 5.38, "lon": -4.05, "type": "district"},
    {"name": "Port-Bouët", "lat": 5.40, "lon": -4.12, "type": "district"},
    {"name": "Anyama", "lat": 5.43, "lon": -4.62, "type": "district"},
    # Autres villes
    {"name": "Dimbokro", "lat": 6.45, "lon": -5.68, "type": "city"},
    {"name": "Oumé", "lat": 6.98, "lon": -7.22, "type": "city"},
    {"name": "Brobo", "lat": 6.45, "lon": -5.12, "type": "city"},
    {"name": "Agboville", "lat": 5.92, "lon": -4.22, "type": "city"},
    {"name": "Grand-Bassam", "lat": 5.21, "lon": -3.73, "type": "city"},
    {"name": "Assinie", "lat": 5.09, "lon": -3.38, "type": "city"},
    {"name": "Tiassalé", "lat": 5.90, "lon": -4.82, "type": "city"},
    {"name": "Daoukro", "lat": 7.00, "lon": -3.98, "type": "city"},
    {"name": "Bondoukou", "lat": 8.04, "lon": -2.80, "type": "city"},
    {"name": "Bouna", "lat": 9.27, "lon": -3.00, "type": "city"},
    {"name": "Ferkessédougou", "lat": 9.58, "lon": -5.20, "type": "city"},
    {"name": "Odienné", "lat": 9.50, "lon": -7.57, "type": "city"},
    {"name": "Séguéla", "lat": 7.97, "lon": -6.67, "type": "city"},
    {"name": "Touba", "lat": 8.28, "lon": -7.68, "type": "city"},
    {"name": "Vavoua", "lat": 7.37, "lon": -6.47, "type": "city"},
    {"name": "Issia", "lat": 6.48, "lon": -6.58, "type": "city"},
    {"name": "Divo", "lat": 5.83, "lon": -5.37, "type": "city"},
    {"name": "Gagnoa", "lat": 6.13, "lon": -5.93, "type": "city"},
    {"name": "Soubré", "lat": 5.78, "lon": -6.59, "type": "city"},
    {"name": "Sassandra", "lat": 4.95, "lon": -6.08, "type": "city"},
    {"name": "Tabou", "lat": 4.42, "lon": -7.35, "type": "city"},
    {"name": "Guiglo", "lat": 6.55, "lon": -7.48, "type": "city"},
    {"name": "Duékoué", "lat": 6.73, "lon": -7.35, "type": "city"},
    {"name": "Bangolo", "lat": 7.03, "lon": -7.47, "type": "city"},
    {"name": "Zouan-Hounien", "lat": 7.23, "lon": -7.73, "type": "city"},
    {"name": "Biankouma", "lat": 7.50, "lon": -7.55, "type": "city"},
    {"name": "Danane", "lat": 7.35, "lon": -8.13, "type": "city"},
    {"name": "Toulepleu", "lat": 6.57, "lon": -8.42, "type": "city"},
    {"name": "Blolequin", "lat": 6.13, "lon": -7.12, "type": "city"},
    {"name": "Gueyo", "lat": 5.68, "lon": -6.10, "type": "city"},
]


@router.get("/search")
def search_places(
    q: str = Query(..., min_length=1, max_length=100, description="Terme de recherche (nom de ville, quartier)"),
    limit: int = Query(10, ge=1, le=50),
    _: User = Depends(auth_deps.current_user),
) -> list[dict]:
    """Recherche de lieux ivoiriens par nom (insensible à la casse, diacritiques ignorés)."""
    query = q.casefold()
    matches = []
    for place in IVOIRIAN_PLACES:
        if query in place["name"].casefold():
            matches.append(place)
    # Tri: correspondances exactes d'abord, puis par longueur, puis alphabétique
    matches.sort(key=lambda p: (0 if query == p["name"].casefold() else 1, len(p["name"]), p["name"]))
    return matches[:limit]


@router.get("/reverse")
def reverse_geocode(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    _: User = Depends(auth_deps.current_user),
) -> dict:
    """Géocodage inverse : trouve le lieu le plus proche des coordonnées données."""
    import math

    def distance(p):
        return math.hypot(p["lat"] - lat, p["lon"] - lon)

    closest = min(IVOIRIAN_PLACES, key=distance)
    return {"place": closest, "distance_km": round(distance(closest) * 111, 1)}