from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.core import (
    Booking, BookingHold, BookingItem, EventSeat, SeatHold
)


def expire_pending_booking(db: Session, booking_id: UUID) -> bool:
    """Expire a pending booking and release all its seats.

    The caller must commit the transaction.
    """

    hold_ids = db.scalars(
        select(BookingHold.hold_id)
        .where(BookingHold.booking_id == booking_id)
    ).all()

    # Support bookings created before booking_holds existed.
    if not hold_ids:
        legacy_hold_id = db.scalar(
            select(Booking.hold_id)
            .where(Booking.id == booking_id)
        )
        if legacy_hold_id is None:
            return False
        hold_ids = [legacy_hold_id]

    seat_ids = db.scalars(
        select(SeatHold.event_seat_id)
        .where(SeatHold.id.in_(hold_ids))
    ).all()

    if len(seat_ids) != len(hold_ids):
        return False

    # Use a consistent lock order.
    seats = db.scalars(
        select(EventSeat)
        .where(EventSeat.id.in_(seat_ids))
        .order_by(EventSeat.id)
        .with_for_update()
    ).all()

    holds = db.scalars(
        select(SeatHold)
        .where(SeatHold.id.in_(hold_ids))
        .order_by(SeatHold.id)
        .with_for_update()
    ).all()

    booking = db.scalar(
        select(Booking)
        .where(Booking.id == booking_id)
        .with_for_update()
    )

    if booking is None or booking.status != "pending":
        return False

    if len(seats) != len(hold_ids) or len(holds) != len(hold_ids):
        return False

    seat_by_id = {seat.id: seat for seat in seats}

    if any(
        hold.event_seat_id not in seat_by_id
        or hold.user_id != booking.user_id
        for hold in holds
    ):
        return False

    now = datetime.now(timezone.utc)

    # Do not expire a booking while all its holds are valid.
    if all(
        hold.status == "active" and hold.expires_at > now
        for hold in holds
    ):
        return False

    # Converted holds may be associated with a completed payment.
    if any(hold.status == "converted" for hold in holds):
        return False

    booking.status = "expired"

    for hold in holds:
        if hold.status == "active":
            hold.status = "expired"

    for seat in seats:
        # Never release a seat assigned to a confirmed booking.
        booking_item = db.scalar(
            select(BookingItem.id)
            .where(BookingItem.event_seat_id == seat.id)
            .limit(1)
        )

        another_active_hold = db.scalar(
            select(SeatHold.id)
            .where(
                SeatHold.event_seat_id == seat.id,
                SeatHold.id.not_in(hold_ids),
                SeatHold.status == "active",
                SeatHold.expires_at > now,
            )
            .limit(1)
        )

        if (
            seat.status == "held"
            and booking_item is None
            and another_active_hold is None
        ):
            seat.status = "available"

    return True
