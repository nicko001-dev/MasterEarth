"""M2.2 : tables du domaine (capteurs, mesures, alertes) avec index PostGIS.

Revision ID: 20261031_1200_domain
Revises: 20261027_1030_initial
"""

import geoalchemy2
import sqlalchemy as sa
from alembic import op

revision = "20261031_1200_domain"
down_revision = "20261027_1030_initial"
branch_labels = None
depends_on = None

_ts = dict(server_default=sa.func.now(), nullable=False)


def upgrade() -> None:
    op.create_table(
        "sensors",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), **_ts),
        sa.Column("updated_at", sa.DateTime(timezone=True), **_ts),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False, server_default="water_level"),
        sa.Column("mount_height_cm", sa.Float, nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("location", geoalchemy2.Geometry("POINT", srid=4326, spatial_index=False), nullable=False),
    )
    op.create_index("ix_sensors_code", "sensors", ["code"], unique=True)
    op.create_index("idx_sensors_location", "sensors", ["location"], postgresql_using="gist")
    op.create_table(
        "readings",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), **_ts),
        sa.Column("updated_at", sa.DateTime(timezone=True), **_ts),
        sa.Column("sensor_id", sa.Integer, sa.ForeignKey("sensors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("measured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("distance_cm", sa.Float, nullable=False),
        sa.Column("water_level_cm", sa.Float, nullable=False),
        sa.Column("rise_cm_min", sa.Float, nullable=False, server_default="0"),
        sa.Column("level", sa.String(8), nullable=False),
        sa.Column("source", sa.String(16), nullable=False, server_default="iot"),
    )
    op.create_index("ix_readings_sensor_time", "readings", ["sensor_id", "measured_at"])
    op.create_table(
        "alerts",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), **_ts),
        sa.Column("updated_at", sa.DateTime(timezone=True), **_ts),
        sa.Column("sensor_id", sa.Integer, sa.ForeignKey("sensors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("level", sa.String(8), nullable=False),
        sa.Column("water_level_cm", sa.Float, nullable=False),
        sa.Column("triggered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("message", sa.String(255), nullable=False),
    )
    op.create_index("ix_alerts_sensor_id", "alerts", ["sensor_id"])


def downgrade() -> None:
    op.drop_table("alerts")
    op.drop_table("readings")
    op.drop_table("sensors")
