"""Moteur IA : identifiants fournisseurs chiffrés et modèles gratuits sélectionnés."""

import sqlalchemy as sa
from alembic import op

revision = "20261102_1100_ai_providers"
down_revision = "20261101_1000_field_observations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_provider_configs",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("encrypted_api_key", sa.Text, nullable=False),
        sa.Column("selected_models", sa.JSON, nullable=False),
        sa.Column("enabled", sa.Boolean, server_default=sa.true(), nullable=False),
        sa.Column("free_tier_confirmed", sa.Boolean, server_default=sa.false(), nullable=False),
        sa.Column("priority", sa.Integer, server_default="100", nullable=False),
        sa.Column("configured_by_user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.UniqueConstraint("provider", name="uq_ai_provider_configs_provider"),
    )
    op.create_index("ix_ai_provider_configs_provider", "ai_provider_configs", ["provider"])


def downgrade() -> None:
    op.drop_index("ix_ai_provider_configs_provider", table_name="ai_provider_configs")
    op.drop_table("ai_provider_configs")
