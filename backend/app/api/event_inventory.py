

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import get_db, require_organizer
from app.models.core import Event, EventSeat, Seat, Section, User
from app.schemas.event_inventory import (
    EventInventoryInitialize,
    EventInventoryResponse,
)


router = APIRouter(
    prefix="/api/v1/events",
    tags=["Event Inventory"],
)


@router.post(
    "/{event_id}/inventory/initialize",
    response_model=EventInventoryResponse,
    status_code=201,
)
def initialize_inventory(
    event_id: UUID,
    payload: EventInventoryInitialize,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_organizer),
):
    # Lock the event to serialize initialization requests.
    event = db.scalar(
        select(Event)
        .where(Event.id == event_id)
        .with_for_update()
    )

    if event is None:
        raise HTTPException(404, "Event not found")

    if (
        event.organizer_id != current_user.id
        and current_user.role != "admin"
    ):
        raise HTTPException(403, "Access denied")

    if event.status != "draft":
        raise HTTPException(
            409,
            "Inventory can only be initialized for draft events",
        )

    existing = db.scalar(
        select(EventSeat.id)
        .where(EventSeat.event_id == event_id)
        .limit(1)
    )

    if existing is not None:
        raise HTTPException(
            409,
            "Inventory already initialized",
        )

    sections = db.scalars(
        select(Section).where(Section.venue_id == event.venue_id)
    ).all()

    section_ids = {section.id for section in sections}

    if not sections or set(payload.section_prices) != section_ids:
        raise HTTPException(
            422,
            "Provide prices for every venue section",
        )

    for price in payload.section_prices.values():
        if not price.is_finite() or price < 0 or price > 99999999.99:
            raise HTTPException(422, "Invalid ticket price")
        if price.as_tuple().exponent < -2:
            raise HTTPException(
                422,
                "Prices must have at most two decimal places",
            )

    seats = db.execute(
        select(Seat.id, Seat.section_id)
        .join(Section, Seat.section_id == Section.id)
        .where(Section.venue_id == event.venue_id)
    ).all()

    if not seats:
        raise HTTPException(422, "Venue has no seats")

    inventory = [
        EventSeat(
            event_id=event_id,
            seat_id=seat_id,
            price=payload.section_prices[section_id],
            status="available",
        )
        for seat_id, section_id in seats
    ]

    db.add_all(inventory)
    db.commit()

    return EventInventoryResponse(
        event_id=event_id,
        seats_created=len(inventory),
        message="Event inventory initialized successfully",
    )
