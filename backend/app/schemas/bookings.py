from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class BookingCreate(BaseModel):
    hold_ids: list[UUID] = Field(min_length=1, max_length=6)


class BookingResponse(BaseModel):
    booking_id: UUID
    event_id: UUID
    seat_ids: list[UUID]
    total_amount: Decimal
    status: str
    created_at: datetime
