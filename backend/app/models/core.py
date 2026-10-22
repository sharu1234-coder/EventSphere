
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


# ============================================================
# USERS
# ============================================================

class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    full_name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    role: Mapped[str] = mapped_column(
        String(20),
        default="customer",
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint(
            "role IN ('customer', 'organizer', 'admin')",
            name="ck_users_role",
        ),
    )


# ============================================================
# VENUES
# ============================================================

class Venue(Base):
    __tablename__ = "venues"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    city: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    address: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )


# ============================================================
# VENUE SECTIONS
# ============================================================

class Section(Base):
    __tablename__ = "sections"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    venue_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("venues.id"),
        nullable=False,
    )

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "venue_id",
            "name",
            name="uq_sections_venue_name",
        ),
    )


# ============================================================
# SEATS
# ============================================================

class Seat(Base):
    __tablename__ = "seats"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    section_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("sections.id"),
        nullable=False,
    )

    row_label: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    seat_number: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "section_id",
            "row_label",
            "seat_number",
            name="uq_seats_position",
        ),
        CheckConstraint(
            "seat_number > 0",
            name="ck_seats_positive_number",
        ),
    )


# ============================================================
# EVENTS
# ============================================================

class Event(Base):
    __tablename__ = "events"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    organizer_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )

    venue_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("venues.id"),
        nullable=False,
    )

    title: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    description: Mapped[str] = mapped_column(
        String(2000),
        nullable=False,
    )

    starts_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    ends_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        default="draft",
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint(
            "ends_at > starts_at",
            name="ck_events_time_range",
        ),
        CheckConstraint(
            "status IN ('draft', 'published', 'cancelled')",
            name="ck_events_status",
        ),
    )


# ============================================================
# USER SESSIONS
# ============================================================

class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    token_hash: Mapped[bytes] = mapped_column(
        LargeBinary(32),
        unique=True,
        nullable=False,
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


# ============================================================
# EVENT SEAT INVENTORY
# ============================================================

class EventSeat(Base):
    __tablename__ = "event_seats"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    event_id: Mapped[UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    seat_id: Mapped[UUID] = mapped_column(
        ForeignKey("seats.id", ondelete="RESTRICT"),
        nullable=False,
    )

    price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="available",
        server_default="available",
    )

    __table_args__ = (
        UniqueConstraint(
            "event_id",
            "seat_id",
        ),
        CheckConstraint(
            "price >= 0",
            name="ck_event_seat_price",
        ),
        CheckConstraint(
            "status IN ('available', 'held', 'booked')",
            name="ck_event_seat_status",
        ),
    )


# ============================================================
# SEAT HOLDS
# ============================================================

class SeatHold(Base):
    __tablename__ = "seat_holds"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    event_seat_id: Mapped[UUID] = mapped_column(
        ForeignKey("event_seats.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
        + timedelta(minutes=10),
    )

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="active",
        server_default="active",
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'expired', 'converted', 'cancelled')",
            name="ck_seat_hold_status",
        ),
        CheckConstraint(
            "expires_at > created_at",
            name="ck_seat_hold_expiration",
        ),
    )


# ============================================================
# BOOKINGS
# ============================================================

class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    event_id: Mapped[UUID] = mapped_column(
        ForeignKey("events.id"),
        nullable=False,
        index=True,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="pending",
    )

    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    hold_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("seat_holds.id"),
        nullable=True,
        unique=True,
        index=True,
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'confirmed', 'cancelled', 'expired')",
            name="ck_bookings_status",
        ),
        CheckConstraint(
            "total_amount >= 0",
            name="ck_bookings_total_amount",
        ),
    )
class BookingHold(Base):
    __tablename__ = "booking_holds"

    booking_id: Mapped[UUID] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"),
        primary_key=True,
    )

    hold_id: Mapped[UUID] = mapped_column(
        ForeignKey("seat_holds.id", ondelete="RESTRICT"),
        primary_key=True,
        unique=True,
    )

# ============================================================
# BOOKING ITEMS
# ============================================================

class BookingItem(Base):
    __tablename__ = "booking_items"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    booking_id: Mapped[UUID] = mapped_column(
        ForeignKey("bookings.id"),
        nullable=False,
        index=True,
    )

    event_seat_id: Mapped[UUID] = mapped_column(
        ForeignKey("event_seats.id"),
        nullable=False,
        index=True,
    )

    price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "booking_id",
            "event_seat_id",
            name="uq_booking_item_seat",
        ),
        UniqueConstraint(
            "event_seat_id",
            name="uq_booking_items_event_seat",
        ),
        CheckConstraint(
            "price >= 0",
            name="ck_booking_items_price",
        ),
    )


# ============================================================
# DIGITAL TICKETS
# ============================================================

class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    booking_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("bookings.id"),
        nullable=False,
        unique=True,
    )

    checked_in_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    qr_token_hash: Mapped[bytes | None] = mapped_column(
        LargeBinary(32),
        unique=True,
        nullable=True,
    )


# ============================================================
# ORGANIZER APPLICATIONS
# ============================================================

class OrganizerApplication(Base):
    __tablename__ = "organizer_applications"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
    )

    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    organization_name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="pending",
        server_default="pending",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')",
            name="ck_organizer_application_status",
        ),
    )
