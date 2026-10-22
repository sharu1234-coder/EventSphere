

from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class EventInventoryInitialize(BaseModel):
    section_prices: dict[UUID, Decimal] = Field(min_length=1)


class EventInventoryResponse(BaseModel):
    event_id: UUID
    seats_created: int
    message: str
