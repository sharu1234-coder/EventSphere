

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from pydantic import Field, model_validator

class EventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organizer_id: UUID
    venue_id: UUID
    title: str
    description: str
    starts_at: datetime
    ends_at: datetime
    status: str

class EventCreate(BaseModel):
    venue_id: UUID
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=10)
    starts_at: datetime
    ends_at: datetime

    @model_validator(mode="after")
    def validate_event_times(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("Event end time must be after start time")
        return self


class EventUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, min_length=10)

