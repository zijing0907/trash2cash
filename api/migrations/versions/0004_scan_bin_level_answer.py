"""Bin-level answer on scans: the likeliest bin, its probability, and whether the model is sure of it.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-26 10:40:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = '0004'
down_revision: str | None = '0003'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Nullable: scans made before this have no bin-level answer, and none is made up for them
    op.add_column('scans', sa.Column('top_bin', sa.String(length=40), nullable=True))
    op.add_column('scans', sa.Column('bin_confidence', sa.Float(), nullable=True))
    op.add_column('scans', sa.Column('bin_unsure', sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column('scans', 'bin_unsure')
    op.drop_column('scans', 'bin_confidence')
    op.drop_column('scans', 'top_bin')
