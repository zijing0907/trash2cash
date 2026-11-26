"""Home pickup requests (Phase 6b). A deposit weighed at a resident's door has no drop-off point.

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-26 14:54:52.537386
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = '0007'
down_revision: str | None = '0006'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('home_pickups',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('resident_id', sa.Integer(), nullable=False),
    sa.Column('status', sa.Enum('requested', 'taken', 'done', 'missed', 'cancelled', name='home_status', native_enum=False, length=20), nullable=False),
    sa.Column('streams', sa.JSON(), nullable=False),
    sa.Column('rough_kg', sa.Float(), nullable=False),
    sa.Column('address', sa.String(length=200), nullable=False),
    sa.Column('lat', sa.Float(), nullable=False),
    sa.Column('lng', sa.Float(), nullable=False),
    sa.Column('note', sa.String(length=200), nullable=False),
    sa.Column('day', sa.Date(), nullable=False),
    sa.Column('slot', sa.Enum('morning', 'afternoon', 'evening', name='pickup_slot', native_enum=False, length=20), nullable=False),
    sa.Column('photo_path', sa.String(length=200), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('collector_id', sa.Integer(), nullable=True),
    sa.Column('taken_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('missed_reason', sa.String(length=200), nullable=True),
    sa.Column('deposit_id', sa.Uuid(), nullable=True),
    sa.ForeignKeyConstraint(['collector_id'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['deposit_id'], ['deposits.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['resident_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_home_pickups_collector_id'), 'home_pickups', ['collector_id'], unique=False)
    op.create_index(op.f('ix_home_pickups_resident_id'), 'home_pickups', ['resident_id'], unique=False)
    op.create_index(op.f('ix_home_pickups_status'), 'home_pickups', ['status'], unique=False)
    op.alter_column('deposits', 'point_id',
               existing_type=sa.INTEGER(),
               nullable=True)


def downgrade() -> None:
    # Fails on purpose if home pickups were weighed: their deposits (and the points they gave) have no point to go to
    op.alter_column('deposits', 'point_id',
               existing_type=sa.INTEGER(),
               nullable=False)
    op.drop_index(op.f('ix_home_pickups_status'), table_name='home_pickups')
    op.drop_index(op.f('ix_home_pickups_resident_id'), table_name='home_pickups')
    op.drop_index(op.f('ix_home_pickups_collector_id'), table_name='home_pickups')
    op.drop_table('home_pickups')
