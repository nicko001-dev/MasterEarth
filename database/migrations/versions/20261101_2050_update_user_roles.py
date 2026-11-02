"""Update user roles to include new business roles

Revision ID: 20261101_2050_update_user_roles
Revises: 20261102_1100_ai_provider_configs
Create Date: 2026-11-01 20:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '20261101_2050_update_user_roles'
down_revision: Union[str, Sequence[str], None] = '20261102_1100_ai_providers'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the old check constraint and create new one with extended roles
    op.drop_constraint('ck_users_role', 'users', type_='check')
    op.create_check_constraint(
        'ck_users_role',
        'users',
        "role in ('citoyen','agent_terrain','analyste','responsable','admin')"
    )


def downgrade() -> None:
    # Revert to old roles
    op.drop_constraint('ck_users_role', 'users', type_='check')
    op.create_check_constraint(
        'ck_users_role',
        'users',
        "role in ('viewer','operator','admin')"
    )