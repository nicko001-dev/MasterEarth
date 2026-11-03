"""Environment configuration for the IntelliFlood backend.

Settings are loaded from environment variables and, when present, a local
``.env`` file. Nothing sensitive is hardcoded; safe local defaults are
documented in ``apps/api/.env.example``.

This is a minimal configuration layer for M0.2/M1. It is intentionally kept
small and must not grow into a full internal architecture (that belongs to
M0.3).
"""

import json
from typing import Union

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Backend configuration.

    Every field can be overridden through an environment variable
    (see ``apps/api/.env.example``). Values are read from a local ``.env``
    file when one exists, but a real ``.env`` must never be committed to the
    repository.
    """

    # Application
    app_name: str = "IntelliFlood API"
    api_version: str = "0.1.0"
    app_env: str = "development"

    # Server
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    api_debug: bool = False

    # CORS (allowed frontend origins)
    cors_origins: Union[list[str], str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ]

    # Database (PostgreSQL/PostGIS)
    postgres_host: str = "127.0.0.1"
    postgres_port: int = 5432
    postgres_user: str = "intelliflood"
    postgres_password: str = "change-me"
    postgres_db: str = "intelliflood"
    postgres_pool_size: int = 5
    postgres_max_overflow: int = 10

    # Comptes et sécurité (M2.3)
    jwt_secret: str = ""  # OBLIGATOIRE : au moins 32 caractères aléatoires (voir .env.example)
    jwt_minutes: int = 480
    admin_email: str = ""  # si renseignés et qu'aucun compte n'existe : création du 1er administrateur
    admin_password: str = ""

    # Intelligence Engine: generated with Fernet.generate_key(); never store API keys without it.
    ai_encryption_key: str = ""
    ai_request_timeout_seconds: int = Field(default=12, ge=3, le=30)

    # Simulation d'inondation (M10) — erreur verticale du MNT PROVISOIRE, à valider localement
    dem_cache_dir: str = "data/dem_cache"
    dem_error_m: float = 1.5
    sim_max_radius_m: float = 5000.0

    # Météo : fournisseur automatique (Open-Meteo : gratuit hors usage commercial, ~10 000 requêtes/jour)
    weather_enabled: bool = True
    weather_refresh_minutes: int = 30
    weather_openweather_api_key: str = ""
    weather_points: str = (
        "Abidjan:5.36:-4.01,Bouaké:7.69:-5.03,Yamoussoukro:6.83:-5.28,San-Pédro:4.75:-6.64,"
        "Korhogo:9.46:-5.63,Daloa:6.88:-6.45,Man:7.41:-7.55"
    )
    # Seuils de pluie PROVISOIRES (à valider avec un hydrologue / la SODEXAM)
    rain_orange_mm_h: float = 10.0
    rain_red_mm_h: float = 30.0
    rain_orange_24h_mm: float = 50.0
    rain_red_24h_mm: float = 100.0

    # Alertes (seuils PROVISOIRES, à valider opérationnellement)
    ingest_api_key: str = ""
    alert_orange_cm: float = 40.0
    alert_red_cm: float = 80.0
    alert_orange_rise_cm_min: float = 5.0
    alert_red_rise_cm_min: float = 10.0
    alert_persistence_cycles: int = 3

    # Sensor freshness cadence is provisional until deployment intervals are known.
    sensor_stale_minutes: int = Field(default=60, ge=1)

    @field_validator("cors_origins", mode="after")
    @classmethod
    def assemble_cors_origins(cls, v: Union[list[str], str]) -> list[str]:
        if isinstance(v, str):
            v_clean = v.strip()
            if v_clean.startswith("[") and v_clean.endswith("]"):
                try:
                    parsed = json.loads(v_clean)
                    if isinstance(parsed, list):
                        return [
                            str(item).strip() for item in parsed if str(item).strip()
                        ]
                except Exception:
                    pass
            return [origin.strip() for origin in v_clean.split(",") if origin.strip()]
        return v

    @property
    def database_url(self) -> str:
        """Build the SQLAlchemy database URL from individual settings."""
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    model_config = SettingsConfigDict(
        env_file=(".env", "apps/api/.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
