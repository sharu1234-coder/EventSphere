

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import get_db, require_organizer
from app.models.core import User, Venue
from app.schemas.venues import VenueCreate, VenueResponse


router = APIRouter(
    prefix="/api/v1/venues",
    tags=["Venues"],
)


@router.post(
    "",
    response_model=VenueResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_venue(
    payload: VenueCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_organizer),
):
    venue = Venue(
        name=payload.name.strip(),
        city=payload.city.strip(),
        address=payload.address.strip(),
    )

    db.add(venue)
    db.commit()
    db.refresh(venue)

    return venue


@router.get("", response_model=list[VenueResponse])
def list_venues(
    db: Session = Depends(get_db),
):
    statement = select(Venue).order_by(Venue.name).limit(100)
    return db.scalars(statement).all()
