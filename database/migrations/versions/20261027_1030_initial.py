"""Initial migration: create base schema and enable PostGIS.

Revision ID: 20261027_1030_initial
Revises:
Create Date: 2026-10-27 10:30:00.000000

"""

from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry, Geography


# revision identifiers, used by Alembic.
revision = '20261027_1030_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable PostGIS extension
    op.execute('CREATE EXTENSION IF NOT EXISTS postgis;')

    # Create a basic schema for future tables
    # This is a minimal migration to establish the baseline
    # Actual domain tables will be created in subsequent migrations (M2+)

    # Example of how PostGIS-enabled tables would be created:
    # op.create_table(
    #     'flood_events',
    #     sa.Column('id', sa.Integer, primary_key=True),
    #     sa.Column('name', sa.String(255), nullable=False),
    #     sa.Column('geometry', Geometry(geometry_type='POLYGON', srid=4326)),
    #     sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    # )
    pass


def downgrade() -> None:
    # Drop PostGIS extension only if no other tables depend on it
    # This is kept minimal as no tables are created in this migration
    op.execute('DROP EXTENSION IF EXISTS postgis CASCADE;')