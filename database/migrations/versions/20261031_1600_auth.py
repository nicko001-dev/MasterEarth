"""M2.3 : organisations, utilisateurs, journal d'audit.

Revision ID: 20261031_1600_auth
Revises: 20261031_1400_weather
"""

import sqlalchemy as sa
from alembic import op

revision = "20261031_1600_auth"
down_revision = "20261031_1400_weather"
branch_labels = None
depends_on = None


def _ts():
    return [sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)]


def upgrade() -> None:
    op.create_table("organizations", *_ts(),
                    sa.Column("name", sa.String(160), nullable=False, unique=True),
                    sa.Column("kind", sa.String(32), nullable=False, server_default="other"))
    op.create_table("users", *_ts(),
                    sa.Column("email", sa.String(254), nullable=False),
                    sa.Column("full_name", sa.String(160), nullable=False),
                    sa.Column("password_hash", sa.String(255), nullable=False),
                    sa.Column("role", sa.String(16), nullable=False, server_default="viewer"),
                    sa.Column("organization_id", sa.Integer, sa.ForeignKey("organizations.id", ondelete="SET NULL")),
                    sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
                    sa.CheckConstraint("role in ('viewer','operator','admin')", name="ck_users_role"))
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_table("audit_log", *_ts(),
                    sa.Column("user_id", sa.Integer),
                    sa.Column("actor", sa.String(254), nullable=False),
                    sa.Column("action", sa.String(64), nullable=False),
                    sa.Column("detail", sa.Text, nullable=False, server_default=""))
    op.create_index("ix_audit_log_action", "audit_log", ["action"])


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_table("users")
    op.drop_table("organizations")
