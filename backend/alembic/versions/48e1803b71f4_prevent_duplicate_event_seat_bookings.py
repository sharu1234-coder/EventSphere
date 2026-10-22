"""prevent duplicate event seat bookings

Revision ID: 48e1803b71f4
Revises: c864803ee759
Create Date: 2026-10-22 02:09:22.237024

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '48e1803b71f4'
down_revision: Union[str, Sequence[str], None] = 'c864803ee759'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None




def upgrade() -> None:
    """Prevent duplicate bookings for the same event seat."""
    op.create_unique_constraint(
        "uq_booking_items_event_seat",
        "booking_items",
        ["event_seat_id"],
    )


def downgrade() -> None:
    """Remove duplicate booking protection."""
    op.drop_constraint(
        "uq_booking_items_event_seat",
        "booking_items",
        type_="unique",
    )


