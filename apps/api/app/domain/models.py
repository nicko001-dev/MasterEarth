"""Modèles de données du domaine inondation (capteurs, mesures, alertes)."""

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, CheckConstraint, JSON, Text, Column, DateTime, Float, Integer, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.infrastructure.db.models import BaseModel


class Sensor(BaseModel):
    __tablename__ = "sensors"

    code = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    kind = Column(String(32), nullable=False, server_default="water_level")
    mount_height_cm = Column(Float, nullable=False)
    status = Column(String(16), nullable=False, server_default="active")
    bankfull_cm = Column(Float, nullable=True)  # niveau de débordement du canal (à mesurer sur place)
    location = Column(Geometry("POINT", srid=4326, spatial_index=True), nullable=False)
    readings = relationship("Reading", back_populates="sensor")


class Reading(BaseModel):
    __tablename__ = "readings"
    __table_args__ = (Index("ix_readings_sensor_time", "sensor_id", "measured_at"),)

    sensor_id = Column(ForeignKey("sensors.id", ondelete="CASCADE"), nullable=False)
    measured_at = Column(DateTime(timezone=True), nullable=False)
    distance_cm = Column(Float, nullable=False)
    water_level_cm = Column(Float, nullable=False)
    rise_cm_min = Column(Float, nullable=False, server_default="0")
    level = Column(String(8), nullable=False)
    source = Column(String(16), nullable=False, server_default="iot")
    sensor = relationship("Sensor", back_populates="readings")


class Alert(BaseModel):
    __tablename__ = "alerts"

    sensor_id = Column(ForeignKey("sensors.id", ondelete="CASCADE"), nullable=False, index=True)
    level = Column(String(8), nullable=False)
    water_level_cm = Column(Float, nullable=False)
    triggered_at = Column(DateTime(timezone=True), nullable=False)
    message = Column(String(255), nullable=False)
    sensor = relationship("Sensor")


class WeatherObservation(BaseModel):
    """Précipitation horaire (mesurée, prévue ou saisie depuis un bulletin officiel) en un point."""

    __tablename__ = "weather_observations"
    __table_args__ = (UniqueConstraint("source", "point_key", "valid_at", name="uq_weather_point_time"),)

    source = Column(String(32), nullable=False)
    point_key = Column(String(24), nullable=False)
    name = Column(String(64), nullable=True)
    location = Column(Geometry("POINT", srid=4326, spatial_index=True), nullable=False)
    valid_at = Column(DateTime(timezone=True), nullable=False)
    precip_mm = Column(Float, nullable=False)
    is_forecast = Column(Boolean, nullable=False, server_default="false")
    fetched_at = Column(DateTime(timezone=True), nullable=False)


class Organization(BaseModel):
    __tablename__ = "organizations"

    name = Column(String(160), unique=True, nullable=False)
    kind = Column(String(32), nullable=False, server_default="other")  # autorité, commune, ONG, école…


class User(BaseModel):
    __tablename__ = "users"

    email = Column(String(254), unique=True, nullable=False, index=True)
    full_name = Column(String(160), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(16), nullable=False, server_default="viewer")
    organization_id = Column(ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True)
    is_active = Column(Boolean, nullable=False, server_default="true")


class RevokedToken(BaseModel):
    """Jetons d'accès invalidés avant leur expiration."""

    __tablename__ = "revoked_tokens"

    jti = Column(String(36), nullable=False, unique=True, index=True)
    user_id = Column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)


class FieldObservation(BaseModel):
    """Observation humaine géolocalisée avec provenance et statut de revue."""

    __tablename__ = "field_observations"
    __table_args__ = (
        CheckConstraint(
            "status in ('new','in_review','verified','rejected')",
            name="ck_field_observations_status",
        ),
        Index("ix_field_observations_org_time", "organization_id", "observed_at"),
    )

    observation_type = Column(String(64), nullable=False)
    description = Column(String(2000), nullable=False)
    observed_at = Column(DateTime(timezone=True), nullable=False)
    location = Column(Geometry("POINT", srid=4326, spatial_index=True), nullable=False)
    source = Column(String(32), nullable=False, server_default="human")
    status = Column(String(16), nullable=False, server_default="new")
    created_by_user_id = Column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    organization_id = Column(ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True)


class AuditLog(BaseModel):
    """Journal d'audit : qui a fait quoi, quand (conservé même si le compte est supprimé)."""

    __tablename__ = "audit_log"

    user_id = Column(Integer, nullable=True)
    actor = Column(String(254), nullable=False)
    action = Column(String(64), nullable=False, index=True)
    detail = Column(Text, nullable=False, server_default="")


class SimulationRun(BaseModel):
    """Exécution d'une simulation (paramètres + résultat) pour traçabilité et reproductibilité."""

    __tablename__ = "simulation_runs"

    user_id = Column(Integer, nullable=True)
    mode = Column(String(16), nullable=False)
    params = Column(Text, nullable=False)
    result = Column(Text, nullable=False)


class AIProviderConfig(BaseModel):
    """Instance-wide, encrypted credentials and free-model order for one AI provider."""

    __tablename__ = "ai_provider_configs"

    provider = Column(String(32), nullable=False, unique=True, index=True)
    encrypted_api_key = Column(Text, nullable=False)
    selected_models = Column(JSON, nullable=False, default=list)
    enabled = Column(Boolean, nullable=False, server_default="true")
    free_tier_confirmed = Column(Boolean, nullable=False, server_default="false")
    priority = Column(Integer, nullable=False, server_default="100")
    configured_by_user_id = Column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
