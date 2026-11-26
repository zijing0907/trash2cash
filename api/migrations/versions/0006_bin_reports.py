"""Reports from the public that a bin is full or overflowing (Phase 6).

The forecast's correction needs no table: it is worked out from pickups.measured and expected_g (0005).

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-26 14:43:56.349765
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = '0006'
down_revision: str | None = '0005'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('bin_reports',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('container_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('level', sa.Enum('full', 'overflowing', name='report_level', native_enum=False, length=20), nullable=False),
    sa.Column('photo_path', sa.String(length=200), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['container_id'], ['containers.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_bin_reports_container_created', 'bin_reports', ['container_id', 'created_at'], unique=False)
    op.create_index(op.f('ix_bin_reports_user_id'), 'bin_reports', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_bin_reports_user_id'), table_name='bin_reports')
    op.drop_index('ix_bin_reports_container_created', table_name='bin_reports')
    op.drop_table('bin_reports')
