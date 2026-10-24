from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, AwareDatetime, Field, computed_field, model_validator

from app.modules.common import Input, Output


def utc(value: datetime) -> datetime:
    if not 1900 <= value.year < 9999:
        raise ValueError("Timestamp outside supported range")
    return value.astimezone(UTC)


Timestamp = Annotated[AwareDatetime, AfterValidator(utc)]
Source = Literal["manual", "health_connect"]
Notes = Annotated[str, Field(max_length=4000)]
Amount = Annotated[Decimal, Field(gt=0, le=10000, max_digits=10, decimal_places=3)]


class WaterCreate(Input):
    amount_ml: Amount
    consumed_at: Timestamp


class WaterPatch(Input):
    amount_ml: Amount | None = None
    consumed_at: Timestamp | None = None

    @model_validator(mode="after")
    def no_null(self):
        if any(getattr(self, key) is None for key in self.model_fields_set):
            raise ValueError("Water fields cannot be null")
        return self


class WaterOut(Output):
    id: UUID
    amount_ml: Decimal
    consumed_at: datetime


class TargetPut(Input):
    effective_date: date
    target_ml: Annotated[Decimal, Field(gt=0, le=20000, max_digits=10, decimal_places=3)]


class TargetOut(Output):
    id: UUID
    effective_date: date
    target_ml: Decimal


class ActivityPut(Input):
    activity_date: date
    steps: Annotated[int, Field(ge=0, le=200000)]
    distance_m: Annotated[Decimal, Field(ge=0, le=1000000, decimal_places=3)] | None = None
    active_minutes: Annotated[int, Field(ge=0, le=1440)] | None = None
    activity_calories: Annotated[Decimal, Field(ge=0, le=100000, decimal_places=3)] | None = None
    source: Source = "manual"
    synced_at: Timestamp | None = None

    @model_validator(mode="after")
    def sync_required(self):
        if self.source == "health_connect" and self.synced_at is None:
            raise ValueError("Health Connect requires synced_at")
        return self


class ActivityOut(Output):
    id: UUID
    activity_date: date
    steps: int
    distance_m: Decimal | None
    active_minutes: int | None
    activity_calories: Decimal | None
    source: str
    synced_at: datetime | None


class SleepStage(Input):
    stage: Literal["awake", "light", "deep", "rem", "sleeping", "unknown"]
    started_at: Timestamp
    ended_at: Timestamp


class SleepCreate(Input):
    started_at: Timestamp
    ended_at: Timestamp
    source: Source = "manual"
    external_id: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    stages: Annotated[list[SleepStage], Field(max_length=500)] | None = None
    notes: Notes | None = None

    @model_validator(mode="after")
    def interval(self):
        seconds = (self.ended_at - self.started_at).total_seconds()
        if not 0 < seconds <= 86400:
            raise ValueError("Sleep must last more than zero and at most 24 hours")
        if self.source == "health_connect" and not self.external_id:
            raise ValueError("Health Connect requires external_id")
        previous = self.started_at
        for stage in self.stages or []:
            if not previous <= stage.started_at < stage.ended_at <= self.ended_at:
                raise ValueError("Stages must be ordered, non-overlapping and inside the session")
            previous = stage.ended_at
        return self


class SleepPatch(Input):
    started_at: Timestamp | None = None
    ended_at: Timestamp | None = None
    stages: Annotated[list[SleepStage], Field(max_length=500)] | None = None
    notes: Notes | None = None

    @model_validator(mode="after")
    def no_null_times(self):
        for key in {"started_at", "ended_at"} & self.model_fields_set:
            if getattr(self, key) is None:
                raise ValueError("Timestamps cannot be null")
        return self


class SleepOut(Output):
    id: UUID
    started_at: datetime
    ended_at: datetime
    source: str
    external_id: str | None
    stages: list[SleepStage] | None
    notes: str | None

    @computed_field
    @property
    def duration_seconds(self) -> float:
        return (self.ended_at - self.started_at).total_seconds()
