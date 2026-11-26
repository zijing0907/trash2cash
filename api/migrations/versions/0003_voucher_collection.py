"""Voucher collection: when staff handed a reward over, and who.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-24 16:01:32.961794
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = '0003'
down_revision: str | None = '0002'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('redemptions', sa.Column('used_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('redemptions', sa.Column('used_by_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_redemptions_used_by', 'redemptions', 'users', ['used_by_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    # WARNING: constraint name is None; this directive will fail as
    # rendered.  Add a name, or use a naming convention; see
    # https://alembic.sqlalchemy.org/en/latest/naming.html
    op.drop_constraint('fk_redemptions_used_by', 'redemptions', type_='foreignkey')
    op.drop_column('redemptions', 'used_by_id')
    op.drop_column('redemptions', 'used_at')
