from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import Query
from pydantic import BaseModel, ConfigDict, Field

Weight = Annotated[Decimal, Field(gt=0, le=1000, max_digits=8, decimal_places=3)]
Nutrient = Annotated[Decimal, Field(ge=0, le=1000000, max_digits=12, decimal_places=3)]
Quantity = Annotated[Decimal, Field(gt=0, le=100000, max_digits=12, decimal_places=3)]
Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Output(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page[T](BaseModel):
    items: list[T]
    limit: int
    offset: int


def day_bounds(day: date, timezone: str) -> tuple[datetime, datetime]:
    from app.core.exceptions import AppError

    if day.year < 1900 or day.year >= 9999:
        raise AppError("INVALID_DATE", "Date is outside the supported range", 422)
    zone = ZoneInfo(timezone)
    start = datetime.combine(day, time.min, zone)
    end = datetime.combine(day + timedelta(days=1), time.min, zone)
    return start.astimezone(UTC), end.astimezone(UTC)
