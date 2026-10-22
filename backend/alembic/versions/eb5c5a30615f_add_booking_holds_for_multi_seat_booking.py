"""Add booking holds for multi-seat booking."""

from alembic import op
import sqlalchemy as sa


revision = "eb5c5a30615f"
down_revision = "eb777909a1ce"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "booking_holds",
        sa.Column(
            "booking_id",
            sa.UUID(),
            sa.ForeignKey("bookings.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "hold_id",
            sa.UUID(),
            sa.ForeignKey("seat_holds.id", ondelete="RESTRICT"),
            primary_key=True,
        ),
        sa.UniqueConstraint(
            "hold_id",
            name="uq_booking_holds_hold_id",
        ),
    )


def downgrade():
    op.drop_table("booking_holds")
