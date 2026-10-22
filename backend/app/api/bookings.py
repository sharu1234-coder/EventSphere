
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, get_db
from app.models.core import Booking, BookingHold, Event, EventSeat, SeatHold, User
from app.schemas.bookings import BookingCreate, BookingResponse
from app.services.booking_expiration import expire_pending_booking


router = APIRouter(
    prefix="/api/v1/bookings",
    tags=["Bookings"],
)


def booking_response(
    db: Session,
    booking: Booking,
) -> BookingResponse:
    seat_ids = db.scalars(
        select(EventSeat.seat_id)
        .join(SeatHold, SeatHold.event_seat_id == EventSeat.id)
        .join(BookingHold, BookingHold.hold_id == SeatHold.id)
        .where(BookingHold.booking_id == booking.id)
        .order_by(EventSeat.id)
    ).all()

    # Support older bookings created before booking_holds existed.
    if not seat_ids and booking.hold_id is not None:
        seat_id = db.scalar(
            select(EventSeat.seat_id)
            .join(SeatHold, SeatHold.event_seat_id == EventSeat.id)
            .where(SeatHold.id == booking.hold_id)
        )
        if seat_id is not None:
            seat_ids = [seat_id]

    return BookingResponse(
        booking_id=booking.id,
        event_id=booking.event_id,
        seat_ids=seat_ids,
        total_amount=booking.total_amount,
        status=booking.status,
        created_at=booking.created_at,
    )


def expire_booking_if_needed(
    db: Session,
    booking: Booking,
) -> None:
    if booking.status != "pending":
        return

    # A legacy booking has no hold to expire through the service.
    if booking.hold_id is None:
        return

    changed = expire_pending_booking(db, booking.id)

    if changed:
        db.commit()
        db.refresh(booking)


def get_booking_event_seat(
    db: Session,
    booking: Booking,
) -> EventSeat | None:
    if booking.hold_id is None:
        return None

    event_seat_id = db.scalar(
        select(SeatHold.event_seat_id)
        .where(SeatHold.id == booking.hold_id)
    )

    if event_seat_id is None:
        return None

    return db.get(EventSeat, event_seat_id)


@router.post(
    "",
    response_model=BookingResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_booking(
    payload: BookingCreate,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    hold_ids = payload.hold_ids

    if len(set(hold_ids)) != len(hold_ids):
        raise HTTPException(400, "Duplicate holds are not allowed")

    # Resolve all holds before acquiring seat locks.
    hold_rows = db.execute(
        select(SeatHold.id, SeatHold.event_seat_id)
        .where(
            SeatHold.id.in_(hold_ids),
            SeatHold.user_id == current_user.id,
        )
    ).all()

    if len(hold_rows) != len(hold_ids):
        raise HTTPException(404, "One or more holds were not found")

    event_seat_ids = [row.event_seat_id for row in hold_rows]

    if len(set(event_seat_ids)) != len(event_seat_ids):
        raise HTTPException(400, "Duplicate seats are not allowed")

    # Lock seats first, followed by holds.
    event_seats = db.scalars(
        select(EventSeat)
        .where(EventSeat.id.in_(event_seat_ids))
        .order_by(EventSeat.id)
        .with_for_update()
    ).all()

    holds = db.scalars(
        select(SeatHold)
        .where(SeatHold.id.in_(hold_ids))
        .order_by(SeatHold.id)
        .with_for_update()
    ).all()

    if len(event_seats) != len(hold_ids) or len(holds) != len(hold_ids):
        raise HTTPException(409, "Reservation mismatch")

    now = datetime.now(timezone.utc)
    event_id = event_seats[0].event_id

    if any(seat.event_id != event_id for seat in event_seats):
        raise HTTPException(400, "Seats must belong to the same event")

    if any(
        hold.user_id != current_user.id
        or hold.status != "active"
        or hold.expires_at <= now
        for hold in holds
    ):
        raise HTTPException(409, "One or more holds have expired")

    if any(seat.status != "held" for seat in event_seats):
        raise HTTPException(409, "One or more seats are unavailable")

    event = db.get(Event, event_id)

    if (
        event is None
        or event.status != "published"
        or event.starts_at <= now
    ):
        raise HTTPException(409, "Event is unavailable for booking")

    existing = db.scalar(
        select(BookingHold.booking_id)
        .where(BookingHold.hold_id.in_(hold_ids))
        .limit(1)
    )

    if existing is not None:
        raise HTTPException(409, "One or more holds already have a booking")

    total_amount = sum(seat.price for seat in event_seats)

    # Retain the first hold for compatibility with existing bookings.
    booking = Booking(
        user_id=current_user.id,
        event_id=event_id,
        hold_id=hold_ids[0],
        total_amount=total_amount,
        status="pending",
    )

    db.add(booking)
    db.flush()

    for hold_id in hold_ids:
        db.add(
            BookingHold(
                booking_id=booking.id,
                hold_id=hold_id,
            )
        )

    db.commit()
    db.refresh(booking)

    return BookingResponse(
        booking_id=booking.id,
        event_id=booking.event_id,
        seat_ids=[seat.seat_id for seat in event_seats],
        total_amount=booking.total_amount,
        status=booking.status,
        created_at=booking.created_at,
    )


@router.get(
    "",
    response_model=list[BookingResponse],
)
def get_my_bookings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bookings = db.scalars(
        select(Booking)
        .where(Booking.user_id == current_user.id)
        .order_by(
            Booking.created_at.desc(),
            Booking.id.desc(),
        )
    ).all()

    results = []

    for booking in bookings:
        expire_booking_if_needed(db, booking)

        event_seat = get_booking_event_seat(db, booking)

        # Include legacy bookings, even without a seat ID.
        results.append(
            booking_response(db, booking)
        )

    return results


@router.get(
    "/{booking_id}",
    response_model=BookingResponse,
)
def get_booking(
    booking_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking = db.scalar(
        select(Booking)
        .where(Booking.id == booking_id)
        .where(Booking.user_id == current_user.id)
    )

    if booking is None:
        raise HTTPException(
            status_code=404,
            detail="Booking not found",
        )

    expire_booking_if_needed(db, booking)

    event_seat = get_booking_event_seat(db, booking)

    return booking_response(db, booking)
