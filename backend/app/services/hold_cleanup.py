

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.core import Booking, BookingItem, EventSeat, SeatHold


def cleanup_expired_holds(
    db: Session,
    batch_size: int = 100,
) -> int:
    """
    Clean up expired holds.

    The caller must commit the transaction.
    Returns the number of holds changed to expired.
    """
    if batch_size < 1:
        raise ValueError("batch_size must be positive")

    now = datetime.now(timezone.utc)

    # Find candidate seat IDs without locking.
    candidate_seat_ids = db.scalars(
        select(SeatHold.event_seat_id)
        .where(
            SeatHold.status == "active",
            SeatHold.expires_at <= now,
        )
        .distinct()
        .limit(batch_size)
    ).all()

    changed = 0

    for seat_id in sorted(candidate_seat_ids):
        # Use the same lock order as hold creation:
        # EventSeat -> SeatHold -> Booking.
        seat = db.scalar(
            select(EventSeat)
            .where(EventSeat.id == seat_id)
            .with_for_update()
        )

        if seat is None:
            continue

        expired_holds = db.scalars(
            select(SeatHold)
            .where(
                SeatHold.event_seat_id == seat.id,
                SeatHold.status == "active",
                SeatHold.expires_at <= now,
            )
            .order_by(SeatHold.id)
            .with_for_update()
        ).all()

        for hold in expired_holds:
            hold.status = "expired"
            changed += 1

            booking = db.scalar(
                select(Booking)
                .where(Booking.hold_id == hold.id)
                .with_for_update()
            )

            if booking is not None and booking.status == "pending":
                booking.status = "expired"

        # Flush status changes before checking ownership.
        db.flush()

        valid_hold_exists = db.scalar(
            select(SeatHold.id)
            .where(
                SeatHold.event_seat_id == seat.id,
                SeatHold.status == "active",
                SeatHold.expires_at > now,
            )
            .limit(1)
        ) is not None

        confirmed_booking_exists = db.scalar(
            select(Booking.id)
            .join(SeatHold, Booking.hold_id == SeatHold.id)
            .where(
                SeatHold.event_seat_id == seat.id,
                Booking.status == "confirmed",
            )
            .limit(1)
        ) is not None

        booking_item_exists = db.scalar(
            select(BookingItem.id)
            .where(BookingItem.event_seat_id == seat.id)
            .limit(1)
        ) is not None

        if (
            seat.status == "held"
            and not valid_hold_exists
            and not confirmed_booking_exists
            and not booking_item_exists
        ):
            seat.status = "available"

    return changed
