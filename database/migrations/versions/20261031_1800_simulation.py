"""M10 : exécutions de simulation + niveau de débordement des capteurs.

Revision ID: 20261031_1800_simulation
Revises: 20261031_1600_auth
"""

import sqlalchemy as sa
from alembic import op

revision = "20261031_1800_simulation"
down_revision = "20261031_1600_auth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sensors", sa.Column("bankfull_cm", sa.Float, nullable=True))
    op.create_table("simulation_runs",
                    sa.Column("id", sa.Integer, primary_key=True),
                    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
                    sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
                    sa.Column("user_id", sa.Integer),
                    sa.Column("mode", sa.String(16), nullable=False),
                    sa.Column("params", sa.Text, nullable=False),
                    sa.Column("result", sa.Text, nullable=False))


def downgrade() -> None:
    op.drop_table("simulation_runs")
    op.drop_column("sensors", "bankfull_cm")
