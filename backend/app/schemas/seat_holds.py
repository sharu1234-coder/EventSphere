from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class SeatHoldCreate(BaseModel):
    seat_ids: list[UUID] = Field(min_length=1, max_length=6)


class SeatHoldResponse(BaseModel):
    hold_ids: list[UUID]
    event_id: UUID
    seat_ids: list[UUID]
    expires_at: datetime
    status: str
