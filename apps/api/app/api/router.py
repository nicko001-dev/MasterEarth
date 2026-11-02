"""Main API router combining all endpoint route modules."""

from fastapi import APIRouter

from app.api.routes import ai, auth, geocoding, health, monitoring, observations, root, simulation, weather

api_router = APIRouter()

# Include individual route groups
api_router.include_router(health.router)
api_router.include_router(root.router)
api_router.include_router(auth.router)
api_router.include_router(monitoring.router)
api_router.include_router(observations.router)
api_router.include_router(weather.router)
api_router.include_router(simulation.router)
api_router.include_router(ai.router)
api_router.include_router(geocoding.router)
