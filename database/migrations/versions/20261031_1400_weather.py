"""M3 : observations météo (précipitations horaires, multi-sources).

Revision ID: 20261031_1400_weather
Revises: 20261031_1200_domain
"""

import geoalchemy2
import sqlalchemy as sa
from alembic import op

revision = "20261031_1400_weather"
down_revision = "20261031_1200_domain"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "weather_observations",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("point_key", sa.String(24), nullable=False),
        sa.Column("name", sa.String(64)),
        sa.Column("location", geoalchemy2.Geometry("POINT", srid=4326, spatial_index=False), nullable=False),
        sa.Column("valid_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("precip_mm", sa.Float, nullable=False),
        sa.Column("is_forecast", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("source", "point_key", "valid_at", name="uq_weather_point_time"),
    )
    op.create_index("idx_weather_location", "weather_observations", ["location"], postgresql_using="gist")
    op.create_index("ix_weather_point_time", "weather_observations", ["point_key", "valid_at"])


def downgrade() -> None:
    op.drop_table("weather_observations")
