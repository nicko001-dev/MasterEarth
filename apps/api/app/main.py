import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.config import settings
from app.core.handlers import register_exception_handlers
from app.core.logging import setup_logging
from app.core.middleware import RequestIDMiddleware
from app.infrastructure.db.session import close_db, session_scope


def _refresh_weather() -> None:
    from app.services import weather

    with session_scope() as db:
        logging.getLogger("weather").info("Collecte météo : %s", weather.refresh(db))


async def _weather_loop() -> None:
    while True:
        try:
            await asyncio.to_thread(_refresh_weather)
        except Exception:  # la collecte ne doit jamais arrêter l'API
            logging.getLogger("weather").exception("Échec de la collecte météo")
        await asyncio.sleep(max(5, settings.weather_refresh_minutes) * 60)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application startup and shutdown lifecycle."""
    # Startup: configure centralized logging
    setup_logging()
    try:
        with session_scope() as db:
            from app.services import accounts
            accounts.bootstrap_admin(db)
    except Exception:  # base non prête : l'API démarre quand même (voir /health)
        logging.getLogger("auth").warning("Amorçage de l'administrateur impossible pour le moment.")
    task = asyncio.create_task(_weather_loop()) if settings.weather_enabled else None
    try:
        yield
    finally:
        if task:
            task.cancel()
        # Shutdown: release database connection pool resources safely
        close_db()


app = FastAPI(
    title=settings.app_name,
    version=settings.api_version,
    debug=settings.api_debug,
    lifespan=lifespan,
)

# Register request correlation ID middleware
app.add_middleware(RequestIDMiddleware)

# CORS configuration driven by environment settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register global standardized exception handlers
register_exception_handlers(app)

# Mount structured API routes
app.include_router(api_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.api_debug,
    )
