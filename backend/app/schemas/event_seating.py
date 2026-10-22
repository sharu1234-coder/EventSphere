

from uuid import UUID

from pydantic import BaseModel
from decimal import Decimal
from typing import Literal

class EventSeatResponse(BaseModel):
    seat_id: UUID
    section_id: UUID
    section_name: str
    row_label: str
    seat_number: int

class EventSeatAvailabilityResponse(BaseModel):
    seat_id: UUID
    section_id: UUID
    section_name: str
    row_label: str
    seat_number: int
    price: Decimal
    status: Literal["available", "held", "booked"]
