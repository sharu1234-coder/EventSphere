
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import get_db, require_organizer
from app.models.core import Event, User, Venue
from app.schemas.events import (
    EventCreate,
    EventResponse,
    EventUpdate,
)


router = APIRouter(
    prefix="/api/v1/events",
    tags=["Events"],
)


# 1. Public event listing
@router.get("", response_model=list[EventResponse])
def list_events(db: Session = Depends(get_db)):
    statement = (
        select(Event)
        .where(Event.status == "published")
        .order_by(Event.starts_at)
        .limit(100)
    )

    return db.scalars(statement).all()


# 2. Organizer access check
@router.get("/organizer/access-check")
def organizer_access_check(
    current_user: User = Depends(require_organizer),
):
    return {
        "message": "Organizer access granted",
        "user_id": str(current_user.id),
        "role": current_user.role,
    }


# 3. Organizer's own events
@router.get(
    "/organizer/my-events",
    response_model=list[EventResponse],
)
def list_my_events(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_organizer),
):
    statement = (
        select(Event)
        .where(Event.organizer_id == current_user.id)
        .order_by(Event.starts_at)
    )

    return db.scalars(statement).all()


# 4. Create an event
@router.post(
    "",
    response_model=EventResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_event(
    payload: EventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_organizer),
):
    venue = db.get(Venue, payload.venue_id)

    if venue is None:
        raise HTTPException(
            status_code=404,
            detail="Venue not found",
        )

    if (
        payload.starts_at.tzinfo is None
        or payload.ends_at.tzinfo is None
        or payload.starts_at.utcoffset() is None
        or payload.ends_at.utcoffset() is None
    ):
        raise HTTPException(
            status_code=422,
            detail="Event times must include timezone information",
        )

    if payload.starts_at <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=422,
            detail="Event must start in the future",
        )

    event = Event(
        organizer_id=current_user.id,
        venue_id=payload.venue_id,
        title=payload.title.strip(),
        description=payload.description.strip(),
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        status="draft",
    )

    db.add(event)
    db.commit()
    db.refresh(event)

    return event


# 5. Public event details
@router.get("/{event_id}", response_model=EventResponse)
def get_event(
    event_id: UUID,
    db: Session = Depends(get_db),
):
    event = db.get(Event, event_id)

    if event is None or event.status != "published":
        raise HTTPException(
            status_code=404,
            detail="Event not found",
        )

    return event


# 6. Update a draft event
@router.patch(
    "/{event_id}",
    response_model=EventResponse,
)
def update_event(
    event_id: UUID,
    payload: EventUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_organizer),
):
    event = db.get(Event, event_id)

    if event is None:
        raise HTTPException(
            status_code=404,
            detail="Event not found",
        )

    if (
        event.organizer_id != current_user.id
        and current_user.role != "admin"
    ):
        raise HTTPException(
            status_code=403,
            detail="Access denied",
        )

    if event.status != "draft":
        raise HTTPException(
            status_code=409,
            detail="Only draft events can be edited",
        )

    updates = payload.model_dump(exclude_unset=True)

    for field, value in updates.items():
        if value is None:
            raise HTTPException(
                status_code=422,
                detail=f"{field} cannot be null",
            )

        setattr(event, field, value.strip())

    db.commit()
    db.refresh(event)

    return event


# 7. Publish an event
@router.post(
    "/{event_id}/publish",
    response_model=EventResponse,
)
def publish_event(
    event_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_organizer),
):
    event = db.get(Event, event_id)

    if event is None:
        raise HTTPException(
            status_code=404,
            detail="Event not found",
        )

    if (
        event.organizer_id != current_user.id
        and current_user.role != "admin"
    ):
        raise HTTPException(
            status_code=403,
            detail="Access denied",
        )

    if event.status != "draft":
        raise HTTPException(
            status_code=409,
            detail="Only draft events can be published",
        )

    if event.starts_at <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=422,
            detail="Cannot publish an event that has already started",
        )

    event.status = "published"

    db.commit()
    db.refresh(event)

    return event
