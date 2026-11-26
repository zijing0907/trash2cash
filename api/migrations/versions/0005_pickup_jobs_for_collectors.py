"""Pickup jobs for collectors, and pickups that record the truck's weight and a photo.

The collector role needs no change here: roles are stored as plain text.

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-26 10:45:45.153147
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = '0005'
down_revision: str | None = '0004'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('jobs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('point_id', sa.Integer(), nullable=False),
    sa.Column('status', sa.Enum('open', 'taken', 'done', 'cancelled', name='job_status', native_enum=False, length=20), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_by_id', sa.Integer(), nullable=True),
    sa.Column('collector_id', sa.Integer(), nullable=True),
    sa.Column('taken_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['collector_id'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['point_id'], ['drop_points.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_jobs_collector_id'), 'jobs', ['collector_id'], unique=False)
    op.create_index(op.f('ix_jobs_point_id'), 'jobs', ['point_id'], unique=False)
    op.create_index(op.f('ix_jobs_status'), 'jobs', ['status'], unique=False)
    op.create_table('job_items',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('job_id', sa.Integer(), nullable=False),
    sa.Column('container_id', sa.Integer(), nullable=False),
    sa.Column('expected_kg', sa.Float(), nullable=False),
    sa.Column('pickup_id', sa.Integer(), nullable=True),
    sa.Column('skipped_reason', sa.String(length=200), nullable=True),
    sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['container_id'], ['containers.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['job_id'], ['jobs.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['pickup_id'], ['pickups.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('job_id', 'container_id')
    )
    op.create_index(op.f('ix_job_items_job_id'), 'job_items', ['job_id'], unique=False)
    # Pickups recorded so far added up the deposits; none were weighed on a truck
    op.add_column('pickups', sa.Column('measured', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('pickups', sa.Column('expected_g', sa.Integer(), nullable=True))
    op.add_column('pickups', sa.Column('photo_path', sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column('pickups', 'photo_path')
    op.drop_column('pickups', 'expected_g')
    op.drop_column('pickups', 'measured')
    op.drop_index(op.f('ix_job_items_job_id'), table_name='job_items')
    op.drop_table('job_items')
    op.drop_index(op.f('ix_jobs_status'), table_name='jobs')
    op.drop_index(op.f('ix_jobs_point_id'), table_name='jobs')
    op.drop_index(op.f('ix_jobs_collector_id'), table_name='jobs')
    op.drop_table('jobs')
