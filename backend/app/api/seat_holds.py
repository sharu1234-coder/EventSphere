
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, get_db
from app.models.core import (
    Booking,
    BookingItem,
    Event,
    EventSeat,
    SeatHold,
    User,
)
from app.schemas.seat_holds import SeatHoldCreate, SeatHoldResponse


router = APIRouter(
    prefix="/api/v1/events",
    tags=["Seat Holds"],
)


def seat_has_booking(db: Session, event_seat_id: UUID) -> bool:
    """Check whether a seat is already assigned to a booking item."""
    return db.scalar(
        select(BookingItem.id)
        .where(BookingItem.event_seat_id == event_seat_id)
        .limit(1)
    ) is not None


def seat_has_confirmed_booking(
    db: Session,
    event_seat_id: UUID,
) -> bool:
    """Check for a confirmed booking linked through a hold."""
    return db.scalar(
        select(Booking.id)
        .join(SeatHold, Booking.hold_id == SeatHold.id)
        .where(
            SeatHold.event_seat_id == event_seat_id,
            Booking.status == "confirmed",
        )
        .limit(1)
    ) is not None


def has_other_valid_hold(
    db: Session,
    event_seat_id: UUID,
    now: datetime,
    exclude_hold_id: UUID | None = None,
) -> bool:
    query = select(SeatHold.id).where(
        SeatHold.event_seat_id == event_seat_id,
        SeatHold.status == "active",
        SeatHold.expires_at > now,
    )

    if exclude_hold_id is not None:
        query = query.where(SeatHold.id != exclude_hold_id)

    return db.scalar(query.limit(1)) is not None


@router.post(
    "/{event_id}/holds",
    response_model=SeatHoldResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_seat_hold(
    event_id: UUID,
    payload: SeatHoldCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    seat_ids = payload.seat_ids

    if len(set(seat_ids)) != len(seat_ids):
        raise HTTPException(400, "Duplicate seats are not allowed")

    # Lock seats in a stable order to prevent deadlocks.
    event_seats = db.scalars(
        select(EventSeat)
        .where(
            EventSeat.event_id == event_id,
            EventSeat.seat_id.in_(seat_ids),
        )
        .order_by(EventSeat.id)
        .with_for_update()
    ).all()

    if len(event_seats) != len(seat_ids):
        raise HTTPException(404, "One or more seats were not found")

    now = datetime.now(timezone.utc)
    event = db.get(Event, event_id)

    if event is None or event.status != "published":
        raise HTTPException(404, "Event not found")

    if event.starts_at <= now:
        raise HTTPException(409, "Event has already started")

    expires_at = now + timedelta(minutes=10)
    holds_by_seat = {}

    for event_seat in event_seats:
        if event_seat.status == "booked":
            raise HTTPException(409, "One or more seats are booked")

        if (
            seat_has_booking(db, event_seat.id)
            or seat_has_confirmed_booking(db, event_seat.id)
        ):
            raise HTTPException(409, "One or more seats are booked")

        active_holds = db.scalars(
            select(SeatHold)
            .where(
                SeatHold.event_seat_id == event_seat.id,
                SeatHold.status == "active",
            )
            .order_by(SeatHold.id)
            .with_for_update()
        ).all()

        for old_hold in active_holds:
            if old_hold.expires_at > now:
                raise HTTPException(409, "One or more seats are held")

            old_hold.status = "expired"

            old_booking = db.scalar(
                select(Booking)
                .where(Booking.hold_id == old_hold.id)
                .with_for_update()
            )

            if old_booking is not None:
                if old_booking.status == "confirmed":
                    raise HTTPException(409, "Seat already booked")
                if old_booking.status == "pending":
                    old_booking.status = "expired"

        hold = SeatHold(
            event_seat_id=event_seat.id,
            user_id=current_user.id,
            created_at=now,
            expires_at=expires_at,
            status="active",
        )

        event_seat.status = "held"
        db.add(hold)
        holds_by_seat[event_seat.seat_id] = hold

    db.flush()

    hold_ids = [holds_by_seat[seat_id].id for seat_id in seat_ids]

    db.commit()

    return SeatHoldResponse(
        hold_ids=hold_ids,
        event_id=event_id,
        seat_ids=seat_ids,
        expires_at=expires_at,
        status="active",
    )


@router.delete(
    "/holds/{hold_id}",
    status_code=status.HTTP_200_OK,
)
def cancel_seat_hold(
    hold_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    event_seat_id = db.scalar(
        select(SeatHold.event_seat_id)
        .where(
            SeatHold.id == hold_id,
            SeatHold.user_id == current_user.id,
        )
    )

    if event_seat_id is None:
        raise HTTPException(404, "Seat hold not found")

    # Consistent lock order: EventSeat -> SeatHold -> Booking.
    event_seat = db.scalar(
        select(EventSeat)
        .where(EventSeat.id == event_seat_id)
        .with_for_update()
    )

    if event_seat is None:
        raise HTTPException(404, "Event seat not found")

    hold = db.scalar(
        select(SeatHold)
        .where(SeatHold.id == hold_id)
        .with_for_update()
    )

    if hold is None or hold.user_id != current_user.id:
        raise HTTPException(404, "Seat hold not found")

    if hold.status != "active":
        raise HTTPException(409, "Seat hold is no longer active")

    booking = db.scalar(
        select(Booking)
        .where(Booking.hold_id == hold.id)
        .with_for_update()
    )

    if booking is not None and booking.status == "confirmed":
        raise HTTPException(
            409,
            "Confirmed bookings cannot be cancelled through a hold",
        )

    now = datetime.now(timezone.utc)
    expired = hold.expires_at <= now

    hold.status = "expired" if expired else "cancelled"

    if booking is not None and booking.status == "pending":
        booking.status = "expired" if expired else "cancelled"

    another_hold_exists = has_other_valid_hold(
        db,
        event_seat.id,
        now,
        exclude_hold_id=hold.id,
    )

    can_release = (
        event_seat.status == "held"
        and not another_hold_exists
        and not seat_has_booking(db, event_seat.id)
        and not seat_has_confirmed_booking(db, event_seat.id)
    )

    if can_release:
        event_seat.status = "available"

    seat_status = event_seat.status
    db.commit()

    return {
        "message": (
            "Seat hold had expired"
            if expired
            else "Seat hold cancelled successfully"
        ),
        "hold_id": str(hold.id),
        "seat_status": seat_status,
    }
