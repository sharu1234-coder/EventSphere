

from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import dotenv_values
from sqlalchemy import create_engine, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.models.core import (
    User,
    Venue,
    Section,
    Seat,
    Event,
    EventSeat,
)


env_path = Path(__file__).resolve().parents[1] / ".env.test"
database_url = dotenv_values(env_path)["DATABASE_URL"]

if make_url(database_url).database != "eventsphere_test_db":
    raise RuntimeError("Refusing to modify a non-test database")

engine = create_engine(database_url)

with Session(engine) as db:
    organizer = db.scalar(
        select(User).where(
            User.email == "testorganizer@example.com"
        )
    )

    if organizer is None:
        raise RuntimeError(
            "Test organizer not found. Create the organizer first."
        )

    venue = Venue(
        name="Concurrency Test Arena",
        city="Hyderabad",
        address="Test Venue Address",
    )
    db.add(venue)
    db.flush()

    section = Section(
        venue_id=venue.id,
        name="Test Section",
    )
    db.add(section)
    db.flush()

    seat = Seat(
        section_id=section.id,
        row_label="A",
        seat_number=1,
    )
    db.add(seat)
    db.flush()

    start_time = datetime.now(timezone.utc) + timedelta(days=30)

    event = Event(
        organizer_id=organizer.id,
        venue_id=venue.id,
        title="Concurrency Test Event",
        description="Automated seat hold testing",
        starts_at=start_time,
        ends_at=start_time + timedelta(hours=3),
        status="published",
    )
    db.add(event)
    db.flush()

    event_seat = EventSeat(
        event_id=event.id,
        seat_id=seat.id,
        price=500,
        status="available",
    )
    db.add(event_seat)
    db.commit()

    print("Test event created successfully!")
    print(f"EVENT_ID={event.id}")
    print(f"SEAT_ID={seat.id}")

engine.dispose()
