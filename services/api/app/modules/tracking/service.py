from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from pydantic import ValidationError

from app.core.exceptions import AppError
from app.db.models import DailyActivity, SleepSession, WaterLog, WaterTarget
from app.modules.common import day_bounds
from app.modules.tracking.schemas import SleepCreate


def date_range(start, end, timezone):
    end = end or datetime.now(ZoneInfo(timezone)).date()
    day_bounds(end, timezone)
    start = start or end - timedelta(days=29)
    if start > end or (end - start).days > 365:
        raise AppError("INVALID_DATE_RANGE", "Use an ordered range of at most 366 days", 422)
    return start, end, day_bounds(start, timezone)[0], day_bounds(end, timezone)[1]


class TrackingService:
    def __init__(self, repository):
        self.repository = repository

    def logs(self, model, column, user_id, start, end, limit, offset):
        _, _, begin, finish = date_range(start, end, self.repository.timezone(user_id))
        return self.repository.records(model, user_id, column, begin, finish, limit, offset)

    def add_water(self, user_id, data):
        return self.repository.save(WaterLog(user_id=user_id, **data.model_dump()))

    def patch_water(self, user_id, row_id, data):
        row = self.repository.owned(WaterLog, user_id, row_id, lock=True)
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(row, key, value)
        return self.repository.save(row)

    def target(self, user_id, data):
        day_bounds(data.effective_date, self.repository.timezone(user_id))
        self.repository.lock_user(user_id)
        row = self.repository.target(user_id, data.effective_date)
        if row and row.effective_date == data.effective_date:
            row.target_ml = data.target_ml
        else:
            row = WaterTarget(user_id=user_id, **data.model_dump())
        return self.repository.save(row)

    def activity(self, user_id, data):
        day_bounds(data.activity_date, self.repository.timezone(user_id))
        if data.synced_at and data.synced_at > datetime.now(UTC) + timedelta(minutes=5):
            raise AppError("INVALID_SYNC_TIME", "Synchronization time is in the future", 422)
        self.repository.lock_user(user_id)
        row = self.repository.activity(user_id, data.activity_date)
        values = data.model_dump()
        if row:
            if row.source == "health_connect" and data.source == "manual":
                raise AppError(
                    "SOURCE_CONFLICT", "Health Connect takes precedence over manual data", 409
                )
            if row.source == data.source == "health_connect" and row.synced_at:
                if data.synced_at < row.synced_at:
                    raise AppError("STALE_SYNC", "A newer synchronization is already stored", 409)
                if data.synced_at == row.synced_at:
                    if any(getattr(row, key) != value for key, value in values.items()):
                        raise AppError(
                            "SYNC_CONFLICT", "Same synchronization time has different data", 409
                        )
                    return row
            for key, value in values.items():
                setattr(row, key, value)
        else:
            row = DailyActivity(user_id=user_id, **values)
        return self.repository.save(row)

    def sleep(self, user_id, data, row_id=None):
        self.repository.lock_user(user_id)
        row = self.repository.owned(SleepSession, user_id, row_id, lock=True) if row_id else None
        if row:
            values = {key: getattr(row, key) for key in SleepCreate.model_fields}
            values.update(data.model_dump(exclude_unset=True))
            try:
                data = SleepCreate.model_validate(values)
            except ValidationError:
                raise AppError("INVALID_SLEEP", "Invalid sleep interval or stages", 422) from None
        else:
            existing = self.repository.imported_sleep(user_id, data.source, data.external_id)
            if existing:
                if (
                    SleepCreate.model_validate(
                        {key: getattr(existing, key) for key in SleepCreate.model_fields}
                    )
                    == data
                ):
                    return existing
                raise AppError(
                    "SYNC_CONFLICT", "Imported ID exists; PATCH the existing session", 409
                )
        if self.repository.overlaps(user_id, data.started_at, data.ended_at, row_id):
            raise AppError("SLEEP_OVERLAP", "Sleep sessions cannot overlap", 409)
        values = data.model_dump(exclude={"stages"})
        values["stages"] = (
            [stage.model_dump(mode="json") for stage in data.stages]
            if data.stages is not None
            else None
        )
        if row:
            for key, value in values.items():
                setattr(row, key, value)
        else:
            row = SleepSession(user_id=user_id, **values)
        return self.repository.save(row)
