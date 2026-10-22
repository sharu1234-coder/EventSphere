

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import get_db
from app.models.core import Event, Seat, Section
from app.schemas.event_seating import EventSeatResponse
from app.models.core import EventSeat
from app.schemas.event_seating import EventSeatAvailabilityResponse
from datetime import datetime, timezone
from sqlalchemy import and_, exists
from app.models.core import SeatHold

router = APIRouter(
    prefix="/api/v1/events",
    tags=["Event Seating"],
)


@router.get(
    "/{event_id}/seats",
    response_model=list[EventSeatResponse],
)
def get_event_seats(
    event_id: UUID,
    db: Session = Depends(get_db),
):
    event = db.get(Event, event_id)

    if event is None or event.status != "published":
        raise HTTPException(
            status_code=404,
            detail="Event not found",
        )

    statement = (
        select(
            Seat.id.label("seat_id"),
            Section.id.label("section_id"),
            Section.name.label("section_name"),
            Seat.row_label,
            Seat.seat_number,
        )
        .join(Section, Seat.section_id == Section.id)
        .where(Section.venue_id == event.venue_id)
        .order_by(
            Section.name,
            Seat.row_label,
            Seat.seat_number,
        )
    )

    return db.execute(statement).mappings().all()


@router.get(
    "/{event_id}/availability",
    response_model=list[EventSeatAvailabilityResponse],
)
def get_event_availability(
    event_id: UUID,
    db: Session = Depends(get_db),
):
    event = db.get(Event, event_id)

    if event is None or event.status != "published":
        raise HTTPException(
            status_code=404,
            detail="Event not found",
        )

    now = datetime.now(timezone.utc)

    statement = (
        select(
            EventSeat.seat_id,
            Section.id.label("section_id"),
            Section.name.label("section_name"),
            Seat.row_label,
            Seat.seat_number,
            EventSeat.price,
            EventSeat.status,
            EventSeat.id.label("event_seat_id"),
        )
        .join(Seat, EventSeat.seat_id == Seat.id)
        .join(Section, Seat.section_id == Section.id)
        .where(EventSeat.event_id == event_id)
        .order_by(
            Section.name,
            Seat.row_label,
            Seat.seat_number,
        )
    )

    rows = db.execute(statement).mappings().all()

    active_seat_ids = set(
        db.scalars(
            select(SeatHold.event_seat_id)
            .where(
                SeatHold.status == "active",
                SeatHold.expires_at > now,
                SeatHold.event_seat_id.in_(
                    [row["event_seat_id"] for row in rows]
                ),
            )
        ).all()
    )

    result = []

    for row in rows:
        seat_status = row["status"]

        if seat_status != "booked":
            seat_status = (
                "held"
                if row["event_seat_id"] in active_seat_ids
                else "available"
            )

        result.append(
            EventSeatAvailabilityResponse(
                seat_id=row["seat_id"],
                section_id=row["section_id"],
                section_name=row["section_name"],
                row_label=row["row_label"],
                seat_number=row["seat_number"],
                price=row["price"],
                status=seat_status,
            )
        )

    return result


