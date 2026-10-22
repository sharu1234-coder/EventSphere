"""add ticket qr token hash

Revision ID: 7a3cd25f3639
Revises: REPLACE_WITH_GENERATED_REVISION
Create Date: 2026-10-22 19:31:00.376007

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7a3cd25f3639'
down_revision: Union[str, Sequence[str], None] = 'REPLACE_WITH_GENERATED_REVISION'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None



def upgrade() -> None:
    op.add_column(
        "tickets",
        sa.Column(
            "qr_token_hash",
            sa.LargeBinary(length=32),
            nullable=True,
        ),
    )

    op.create_unique_constraint(
        "uq_tickets_qr_token_hash",
        "tickets",
        ["qr_token_hash"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_tickets_qr_token_hash",
        "tickets",
        type_="unique",
    )

    op.drop_column(
        "tickets",
        "qr_token_hash",
    )
