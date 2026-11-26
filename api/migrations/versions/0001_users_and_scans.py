"""Users and scans (Milestone 2).

Revision ID: 0001
Revises: 
Create Date: 2026-11-23 09:33:24.699980
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = '0001'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('email', sa.String(length=254), nullable=False),
    sa.Column('display_name', sa.String(length=60), nullable=False),
    sa.Column('password_hash', sa.String(length=200), nullable=False),
    sa.Column('role', sa.Enum('resident', 'operator', 'admin', name='user_role', native_enum=False, length=20), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_table('scans',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('model_version', sa.String(length=80), nullable=False),
    sa.Column('predicted_class', sa.String(length=40), nullable=False),
    sa.Column('predicted_bin', sa.String(length=40), nullable=True),
    sa.Column('confidence', sa.Float(), nullable=False),
    sa.Column('unsure', sa.Boolean(), nullable=False),
    sa.Column('zoomed', sa.Boolean(), nullable=False),
    sa.Column('top3', sa.JSON(), nullable=False),
    sa.Column('dhash', sa.String(length=16), nullable=False),
    sa.Column('latency_ms', sa.Float(), nullable=False),
    sa.Column('user_label', sa.String(length=40), nullable=True),
    sa.Column('labelled_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('photo_path', sa.String(length=200), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_scans_created_at'), 'scans', ['created_at'], unique=False)
    op.create_index('ix_scans_user_created', 'scans', ['user_id', 'created_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_scans_user_created', table_name='scans')
    op.drop_index(op.f('ix_scans_created_at'), table_name='scans')
    op.drop_table('scans')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
