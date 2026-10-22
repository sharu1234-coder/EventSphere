from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class TicketSeat(BaseModel):
    section_name: str
    row_label: str
    seat_number: int


class TicketResponse(BaseModel):
    ticket_id: UUID
    booking_id: UUID
    event_id: UUID
    event_title: str
    event_starts_at: datetime
    seats: list[TicketSeat]
    checked_in_at: datetime | None


class TicketQRResponse(BaseModel):
    ticket_id: UUID
    qr_code: str


class TicketCheckInRequest(BaseModel):
    token: str


class TicketCheckInResponse(BaseModel):
    message: str
    ticket_id: UUID
    checked_in_at: datetime
