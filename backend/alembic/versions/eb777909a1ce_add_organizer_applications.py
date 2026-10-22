
"""Add missing ticket QR token hash.

Revision ID: eb777909a1ce
Revises: d83cae80c8cf
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "eb777909a1ce"
down_revision: Union[str, Sequence[str], None] = "d83cae80c8cf"
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
