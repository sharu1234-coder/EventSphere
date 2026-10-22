

import uuid

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Column,
    String,
    DateTime,
    ForeignKey,
    Numeric,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from app.models.core import Base


class Payment(Base):
    __tablename__ = "payments"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    booking_id = Column(
        UUID(as_uuid=True),
        ForeignKey("bookings.id"),
        nullable=False,
        index=True,
    )

    razorpay_order_id = Column(
        String(100),
        unique=True,
        nullable=False,
    )

    razorpay_payment_id = Column(
        String(100),
        unique=True,
        nullable=True,
    )

    amount = Column(
        Numeric(12, 2),
        nullable=False,
    )

    currency = Column(
        String(3),
        nullable=False,
        default="INR",
    )

    status = Column(
        String(30),
        nullable=False,
        default="created",
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    verified_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    __table_args__ = (
        UniqueConstraint(
            "booking_id",
            "razorpay_order_id",
            name="uq_payment_booking_order",
        ),
    )
