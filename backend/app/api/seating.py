

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.auth import get_db, require_organizer
from app.models.core import Section, Seat, User, Venue
from app.schemas.seating import (
    SectionCreate,
    SectionResponse,
    SeatGenerate,
    SeatResponse,
)

router = APIRouter(tags=["Seating"])


@router.post(
    "/api/v1/venues/{venue_id}/sections",
    response_model=SectionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_section(
    venue_id: UUID,
    payload: SectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_organizer),
):
    if db.get(Venue, venue_id) is None:
        raise HTTPException(status_code=404, detail="Venue not found")

    section = Section(
        venue_id=venue_id,
        name=payload.name.strip(),
    )
    db.add(section)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Section already exists",
        )

    db.refresh(section)
    return section


@router.get(
    "/api/v1/venues/{venue_id}/sections",
    response_model=list[SectionResponse],
)
def list_sections(
    venue_id: UUID,
    db: Session = Depends(get_db),
):
    if db.get(Venue, venue_id) is None:
        raise HTTPException(status_code=404, detail="Venue not found")

    return db.scalars(
        select(Section)
        .where(Section.venue_id == venue_id)
        .order_by(Section.name)
    ).all()


@router.post(
    "/api/v1/sections/{section_id}/seats/generate",
    response_model=list[SeatResponse],
    status_code=status.HTTP_201_CREATED,
)
def generate_seats(
    section_id: UUID,
    payload: SeatGenerate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_organizer),
):
    if db.get(Section, section_id) is None:
        raise HTTPException(status_code=404, detail="Section not found")

    labels = [label.strip().upper() for label in payload.row_labels]

    if any(not label or len(label) > 20 for label in labels):
        raise HTTPException(status_code=422, detail="Invalid row label")

    if len(set(labels)) != len(labels):
        raise HTTPException(status_code=422, detail="Duplicate row labels")

    seats = [
        Seat(
            section_id=section_id,
            row_label=row,
            seat_number=number,
        )
        for row in labels
        for number in range(1, payload.seats_per_row + 1)
    ]

    db.add_all(seats)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="One or more seats already exist",
        )

    for seat in seats:
        db.refresh(seat)

    return seats


@router.get(
    "/api/v1/sections/{section_id}/seats",
    response_model=list[SeatResponse],
)
def list_seats(
    section_id: UUID,
    db: Session = Depends(get_db),
):
    if db.get(Section, section_id) is None:
        raise HTTPException(status_code=404, detail="Section not found")

    return db.scalars(
        select(Seat)
        .where(Seat.section_id == section_id)
        .order_by(Seat.row_label, Seat.seat_number)
    ).all()
