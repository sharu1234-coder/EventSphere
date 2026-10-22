

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SectionCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)


class SectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    venue_id: UUID
    name: str


class SeatGenerate(BaseModel):
    row_labels: list[str] = Field(min_length=1, max_length=50)
    seats_per_row: int = Field(ge=1, le=100)


class SeatResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    section_id: UUID
    row_label: str
    seat_number: int
