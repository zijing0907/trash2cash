"""Drop-off points, deposits, the points ledger, rewards and pickups (Milestones 3 and 4).

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-24 15:11:45.864101
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def _code() -> str:
    import secrets

    raw = "".join(secrets.choice(ALPHABET) for _ in range(8))
    return f"{raw[:4]}-{raw[4:]}"


revision: str = '0002'
down_revision: str | None = '0001'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('drop_points',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('address', sa.String(length=200), nullable=False),
    sa.Column('lat', sa.Float(), nullable=False),
    sa.Column('lng', sa.Float(), nullable=False),
    sa.Column('active', sa.Boolean(), nullable=False),
    sa.Column('is_demo', sa.Boolean(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('rewards',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('description', sa.String(length=200), nullable=False),
    sa.Column('cost_points', sa.Integer(), nullable=False),
    sa.Column('stock', sa.Integer(), nullable=True),
    sa.Column('active', sa.Boolean(), nullable=False),
    sa.Column('is_demo', sa.Boolean(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('streams',
    sa.Column('key', sa.String(length=40), nullable=False),
    sa.Column('name', sa.String(length=60), nullable=False),
    sa.Column('points_per_kg', sa.Integer(), nullable=False),
    sa.Column('price_sen_per_kg', sa.Integer(), nullable=False),
    sa.Column('sort', sa.Integer(), nullable=False),
    sa.PrimaryKeyConstraint('key')
    )
    op.create_table('containers',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('point_id', sa.Integer(), nullable=False),
    sa.Column('stream_key', sa.String(length=40), nullable=False),
    sa.Column('capacity_kg', sa.Integer(), nullable=False),
    sa.Column('emptied_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['point_id'], ['drop_points.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['stream_key'], ['streams.key'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('point_id', 'stream_key')
    )
    op.create_table('deposits',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('point_id', sa.Integer(), nullable=False),
    sa.Column('resident_id', sa.Integer(), nullable=False),
    sa.Column('operator_id', sa.Integer(), nullable=False),
    sa.Column('points', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['operator_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['point_id'], ['drop_points.id'], ),
    sa.ForeignKeyConstraint(['resident_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_deposits_created_at'), 'deposits', ['created_at'], unique=False)
    op.create_index('ix_deposits_point_created', 'deposits', ['point_id', 'created_at'], unique=False)
    op.create_index(op.f('ix_deposits_resident_id'), 'deposits', ['resident_id'], unique=False)
    op.create_table('pickups',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('container_id', sa.Integer(), nullable=False),
    sa.Column('collected_g', sa.Integer(), nullable=False),
    sa.Column('by_user_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['by_user_id'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['container_id'], ['containers.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_pickups_container_id'), 'pickups', ['container_id'], unique=False)
    op.create_table('redemptions',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('reward_id', sa.Integer(), nullable=False),
    sa.Column('cost_points', sa.Integer(), nullable=False),
    sa.Column('code', sa.String(length=12), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['reward_id'], ['rewards.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code')
    )
    op.create_index(op.f('ix_redemptions_user_id'), 'redemptions', ['user_id'], unique=False)
    op.create_table('deposit_lines',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('deposit_id', sa.Uuid(), nullable=False),
    sa.Column('stream_key', sa.String(length=40), nullable=False),
    sa.Column('weight_g', sa.Integer(), nullable=False),
    sa.Column('points', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['deposit_id'], ['deposits.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['stream_key'], ['streams.key'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_deposit_lines_deposit_id'), 'deposit_lines', ['deposit_id'], unique=False)
    op.create_table('points_ledger',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('delta', sa.Integer(), nullable=False),
    sa.Column('reason', sa.Enum('deposit', 'redemption', 'adjustment', name='ledger_reason', native_enum=False, length=20), nullable=False),
    sa.Column('deposit_id', sa.Uuid(), nullable=True),
    sa.Column('redemption_id', sa.Uuid(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['deposit_id'], ['deposits.id'], ),
    sa.ForeignKeyConstraint(['redemption_id'], ['redemptions.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_points_ledger_user_id'), 'points_ledger', ['user_id'], unique=False)
    op.add_column('users', sa.Column('member_code', sa.String(length=12), nullable=True))
    op.add_column('users', sa.Column('drop_point_id', sa.Integer(), nullable=True))
    # Existing users get a member code before the column becomes required
    conn = op.get_bind()
    used = set()
    for (uid,) in conn.execute(sa.text("SELECT id FROM users")).fetchall():
        code = _code()
        while code in used:
            code = _code()
        used.add(code)
        conn.execute(sa.text("UPDATE users SET member_code = :c WHERE id = :i"), {"c": code, "i": uid})
    op.alter_column('users', 'member_code', nullable=False)
    op.create_index(op.f('ix_users_member_code'), 'users', ['member_code'], unique=True)
    op.create_foreign_key('fk_users_drop_point', 'users', 'drop_points', ['drop_point_id'], ['id'], ondelete='SET NULL')
    # The five bins a drop-off point can hold. Points and prices are placeholders until an admin sets them.
    op.bulk_insert(
        sa.table('streams', sa.column('key'), sa.column('name'), sa.column('points_per_kg'),
                 sa.column('price_sen_per_kg'), sa.column('sort')),
        [
            {'key': 'blue bin', 'name': 'Paper and cardboard', 'points_per_kg': 10, 'price_sen_per_kg': 0, 'sort': 1},
            {'key': 'brown bin', 'name': 'Glass bottles and jars', 'points_per_kg': 10, 'price_sen_per_kg': 0, 'sort': 2},
            {'key': 'orange bin', 'name': 'Plastic and metal cans', 'points_per_kg': 10, 'price_sen_per_kg': 0, 'sort': 3},
            {'key': 'e-waste collection', 'name': 'Batteries and electronics', 'points_per_kg': 10, 'price_sen_per_kg': 0, 'sort': 4},
            {'key': 'textile donation', 'name': 'Clothes and shoes', 'points_per_kg': 10, 'price_sen_per_kg': 0, 'sort': 5},
        ],
    )


def downgrade() -> None:
    # WARNING: constraint name is None; this directive will fail as
    # rendered.  Add a name, or use a naming convention; see
    # https://alembic.sqlalchemy.org/en/latest/naming.html
    op.drop_constraint('fk_users_drop_point', 'users', type_='foreignkey')
    op.drop_index(op.f('ix_users_member_code'), table_name='users')
    op.drop_column('users', 'drop_point_id')
    op.drop_column('users', 'member_code')
    op.drop_index(op.f('ix_points_ledger_user_id'), table_name='points_ledger')
    op.drop_table('points_ledger')
    op.drop_index(op.f('ix_deposit_lines_deposit_id'), table_name='deposit_lines')
    op.drop_table('deposit_lines')
    op.drop_index(op.f('ix_redemptions_user_id'), table_name='redemptions')
    op.drop_table('redemptions')
    op.drop_index(op.f('ix_pickups_container_id'), table_name='pickups')
    op.drop_table('pickups')
    op.drop_index(op.f('ix_deposits_resident_id'), table_name='deposits')
    op.drop_index('ix_deposits_point_created', table_name='deposits')
    op.drop_index(op.f('ix_deposits_created_at'), table_name='deposits')
    op.drop_table('deposits')
    op.drop_table('containers')
    op.drop_table('streams')
    op.drop_table('rewards')
    op.drop_table('drop_points')
