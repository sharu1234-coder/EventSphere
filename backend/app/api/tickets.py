
import base64
import hashlib
import hmac
import io
import os
from datetime import datetime, timezone
from uuid import UUID

import qrcode

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.auth import get_current_user, get_db

from app.models.core import (
    Booking,
    BookingItem,
    Event,
    EventSeat,
    Seat,
    SeatHold,
    Section,
    Ticket,
    User,
)

from app.schemas.tickets import (
    TicketResponse,
    TicketSeat,
    TicketQRResponse,
    TicketCheckInRequest,
    TicketCheckInResponse,
)


router = APIRouter(
    prefix="/api/v1/tickets",
    tags=["Tickets"],
)


# ---------------------------------------------------
# 1. Ticket signing secret
# ---------------------------------------------------

def get_ticket_secret() -> bytes:
    secret = os.getenv("TICKET_SIGNING_SECRET", "")

    if len(secret) < 32:
        raise HTTPException(
            status_code=503,
            detail=(
                "TICKET_SIGNING_SECRET is not configured. "
                "Set it in the backend environment."
            ),
        )

    return secret.encode("utf-8")


# ---------------------------------------------------
# 2. Create secure QR token
# ---------------------------------------------------

def make_token(ticket: Ticket) -> str:
    payload = f"v1.{ticket.id}.{ticket.booking_id}"

    signature = hmac.new(
        get_ticket_secret(),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return f"{payload}.{signature}"


# ---------------------------------------------------
# 3. Verify QR token
# ---------------------------------------------------

def parse_token(token: str) -> tuple[UUID, UUID]:
    parts = token.split(".")

    if len(parts) != 4 or parts[0] != "v1":
        raise HTTPException(
            status_code=400,
            detail="Invalid ticket QR code",
        )

    try:
        ticket_id = UUID(parts[1])
        booking_id = UUID(parts[2])
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid ticket QR code",
        )

    payload = ".".join(parts[:3])

    expected_signature = hmac.new(
        get_ticket_secret(),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(
        expected_signature,
        parts[3],
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid ticket signature",
        )

    return ticket_id, booking_id


# ---------------------------------------------------
# 4. Create ticket for confirmed booking
# ---------------------------------------------------

def ensure_ticket(
    db: Session,
    booking: Booking,
) -> Ticket:

    if booking.status != "confirmed":
        raise HTTPException(
            status_code=409,
            detail="Only confirmed bookings can have tickets",
        )

    ticket = db.scalar(
        select(Ticket).where(
            Ticket.booking_id == booking.id
        )
    )

    if ticket is not None:
        return ticket

    ticket = Ticket(
        booking_id=booking.id,
    )

    try:
        with db.begin_nested():
            db.add(ticket)
            db.flush()

    except IntegrityError:
        ticket = db.scalar(
            select(Ticket).where(
                Ticket.booking_id == booking.id
            )
        )

        if ticket is None:
            raise

    db.commit()
    db.refresh(ticket)

    return ticket


# ---------------------------------------------------
# 5. Find seat details
# ---------------------------------------------------

def get_booking_seats(
    db: Session,
    booking: Booking,
):
    records = db.execute(
        select(
            Section.name,
            Seat.row_label,
            Seat.seat_number,
        )
        .select_from(BookingItem)
        .join(EventSeat, BookingItem.event_seat_id == EventSeat.id)
        .join(Seat, EventSeat.seat_id == Seat.id)
        .join(Section, Seat.section_id == Section.id)
        .where(
            BookingItem.booking_id == booking.id,
            EventSeat.event_id == booking.event_id,
        )
        .order_by(Section.name, Seat.row_label, Seat.seat_number)
    ).all()

    # Compatibility with older confirmed bookings.
    if not records and booking.hold_id is not None:
        records = db.execute(
            select(
                Section.name,
                Seat.row_label,
                Seat.seat_number,
            )
            .select_from(SeatHold)
            .join(EventSeat, SeatHold.event_seat_id == EventSeat.id)
            .join(Seat, EventSeat.seat_id == Seat.id)
            .join(Section, Seat.section_id == Section.id)
            .where(
                SeatHold.id == booking.hold_id,
                EventSeat.event_id == booking.event_id,
            )
        ).all()

    return [
        TicketSeat(
            section_name=section_name,
            row_label=row_label,
            seat_number=seat_number,
        )
        for section_name, row_label, seat_number in records
    ]


def ticket_details(
    db: Session,
    ticket: Ticket,
) -> TicketResponse:
    booking = db.get(Booking, ticket.booking_id)

    if booking is None or booking.status != "confirmed":
        raise HTTPException(404, "Confirmed booking not found")

    event = db.get(Event, booking.event_id)

    if event is None:
        raise HTTPException(404, "Event not found")

    seats = get_booking_seats(db, booking)

    if not seats:
        raise HTTPException(404, "Ticket seat details not found")

    return TicketResponse(
        ticket_id=ticket.id,
        booking_id=booking.id,
        event_id=event.id,
        event_title=event.title,
        event_starts_at=event.starts_at,
        seats=seats,
        checked_in_at=ticket.checked_in_at,
    )


# ---------------------------------------------------
# 7. GET - My Tickets
# ---------------------------------------------------

@router.get(
    "",
    response_model=list[TicketResponse],
)
def get_my_tickets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    bookings = db.scalars(
        select(Booking)
        .where(
            Booking.user_id == current_user.id,
            Booking.status == "confirmed",
        )
        .order_by(
            Booking.created_at.desc()
        )
    ).all()

    results = []

    for booking in bookings:

        ticket = ensure_ticket(
            db,
            booking,
        )

        details = ticket_details(
            db,
            ticket,
        )

        results.append(details)

    return results


# ---------------------------------------------------
# 8. GET - Generate QR Code
# ---------------------------------------------------

@router.get(
    "/{ticket_id}/qr",
    response_model=TicketQRResponse,
)
def get_ticket_qr(
    ticket_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    ticket = db.get(
        Ticket,
        ticket_id,
    )

    if ticket is None:
        raise HTTPException(
            status_code=404,
            detail="Ticket not found",
        )

    booking = db.get(
        Booking,
        ticket.booking_id,
    )

    if (
        booking is None
        or booking.user_id != current_user.id
        or booking.status != "confirmed"
    ):
        raise HTTPException(
            status_code=404,
            detail="Ticket not found",
        )

    token = make_token(ticket)

    qr = qrcode.QRCode(
        version=None,
        error_correction=(
            qrcode.constants.ERROR_CORRECT_M
        ),
        box_size=8,
        border=4,
    )

    qr.add_data(token)
    qr.make(fit=True)

    image = qr.make_image(
        fill_color="black",
        back_color="white",
    )

    buffer = io.BytesIO()

    image.save(
        buffer,
        format="PNG",
    )

    encoded = base64.b64encode(
        buffer.getvalue()
    ).decode("ascii")

    return TicketQRResponse(
        ticket_id=ticket.id,
        qr_code=(
            f"data:image/png;base64,{encoded}"
        ),
    )


# ---------------------------------------------------
# 9. POST - Ticket Check-In
# ---------------------------------------------------

@router.post(
    "/check-in",
    response_model=TicketCheckInResponse,
)
def check_in_ticket(
    payload: TicketCheckInRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):

    if current_user.role not in (
        "organizer",
        "admin",
    ):
        raise HTTPException(
            status_code=403,
            detail="Staff access required",
        )

    ticket_id, booking_id = parse_token(
        payload.token.strip()
    )

    # Lock ticket row to prevent two simultaneous
    # requests from checking in the same ticket.

    ticket = db.scalar(
        select(Ticket)
        .where(
            Ticket.id == ticket_id
        )
        .with_for_update()
    )

    if (
        ticket is None
        or ticket.booking_id != booking_id
    ):
        raise HTTPException(
            status_code=404,
            detail="Ticket not found",
        )

    booking = db.get(
        Booking,
        ticket.booking_id,
    )

    if (
        booking is None
        or booking.status != "confirmed"
    ):
        raise HTTPException(
            status_code=409,
            detail="Ticket booking is not confirmed",
        )

    event = db.get(
        Event,
        booking.event_id,
    )

    if event is None:
        raise HTTPException(
            status_code=404,
            detail="Event not found",
        )

    # Only the event organizer or an admin
    # can validate the ticket.

    if (
        current_user.role != "admin"
        and event.organizer_id != current_user.id
    ):
        raise HTTPException(
            status_code=403,
            detail="Not authorized for this event",
        )

    if event.status != "published":
        raise HTTPException(
            status_code=409,
            detail="Event is not active",
        )

    now = datetime.now(timezone.utc)

    # Allow check-in starting 2 hours before
    # the event, until its scheduled end.

    from datetime import timedelta

    check_in_opens = (
        event.starts_at - timedelta(hours=2)
    )

    if not (
        check_in_opens <= now <= event.ends_at
    ):
        raise HTTPException(
            status_code=409,
            detail="Ticket check-in is outside event hours",
        )

    if ticket.checked_in_at is not None:
        raise HTTPException(
            status_code=409,
            detail="Ticket has already been used",
        )

    ticket.checked_in_at = now

    db.commit()
    db.refresh(ticket)

    return TicketCheckInResponse(
        message="Ticket checked in successfully",
        ticket_id=ticket.id,
        checked_in_at=ticket.checked_in_at,
    )
