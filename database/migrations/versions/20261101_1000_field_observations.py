"""M2 : observations terrain géolocalisées et workflow de revue.

Revision ID: 20261101_1000_field_observations
Revises: 20261101_0900_revoked_tokens
"""

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry

revision = "20261101_1000_field_observations"
down_revision = "20261101_0900_revoked_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "field_observations",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("observation_type", sa.String(64), nullable=False),
        sa.Column("description", sa.String(2000), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("location", Geometry("POINT", srid=4326, spatial_index=False), nullable=False),
        sa.Column("source", sa.String(32), nullable=False, server_default="human"),
        sa.Column("status", sa.String(16), nullable=False, server_default="new"),
        sa.Column("created_by_user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("organization_id", sa.Integer, sa.ForeignKey("organizations.id", ondelete="SET NULL")),
        sa.CheckConstraint(
            "status in ('new','in_review','verified','rejected')",
            name="ck_field_observations_status",
        ),
    )
    op.create_index(
        "ix_field_observations_org_time",
        "field_observations",
        ["organization_id", "observed_at"],
    )
    op.create_index(
        "idx_field_observations_location",
        "field_observations",
        ["location"],
        postgresql_using="gist",
    )


def downgrade() -> None:
    op.drop_table("field_observations")
