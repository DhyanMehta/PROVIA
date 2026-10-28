from sqlalchemy import select

from app.core.exceptions import AppError
from app.db.models import DailyActivity, SleepSession, User, UserProfile, WaterTarget


class TrackingRepository:
    """Shared persistence operations for owner-scoped tracking records."""

    def __init__(self, session):
        self.session = session

    def lock_user(self, user_id):
        self.session.execute(select(User.id).where(User.id == user_id).with_for_update())

    def timezone(self, user_id):
        return (
            self.session.scalar(select(UserProfile.timezone).where(UserProfile.user_id == user_id))
            or "UTC"
        )

    def owned(self, model, user_id, row_id, lock=False):
        query = select(model).where(model.user_id == user_id, model.id == row_id)
        row = self.session.scalar(query.with_for_update() if lock else query)
        if row is None:
            raise AppError("RESOURCE_NOT_FOUND", "Record was not found", 404)
        return row

    def save(self, row):
        self.session.add(row)
        self.session.flush()
        return row

    def delete(self, row):
        self.session.delete(row)
        self.session.flush()

    def records(self, model, user_id, column, start, end, limit=10000, offset=0):
        return self.session.scalars(
            select(model)
            .where(model.user_id == user_id, column >= start, column < end)
            .order_by(column, model.id)
            .limit(limit)
            .offset(offset)
        ).all()

    def activity(self, user_id, day):
        return self.session.scalar(
            select(DailyActivity).where(
                DailyActivity.user_id == user_id, DailyActivity.activity_date == day
            )
        )

    def activities(self, user_id, start, end, limit, offset):
        return self.session.scalars(
            select(DailyActivity)
            .where(
                DailyActivity.user_id == user_id,
                DailyActivity.activity_date >= start,
                DailyActivity.activity_date <= end,
            )
            .order_by(DailyActivity.activity_date, DailyActivity.id)
            .limit(limit)
            .offset(offset)
        ).all()

    def target(self, user_id, day):
        return self.session.scalar(
            select(WaterTarget)
            .where(WaterTarget.user_id == user_id, WaterTarget.effective_date <= day)
            .order_by(WaterTarget.effective_date.desc())
            .limit(1)
        )

    def imported_sleep(self, user_id, source, external_id):
        if external_id is None:
            return None
        return self.session.scalar(
            select(SleepSession).where(
                SleepSession.user_id == user_id,
                SleepSession.source == source,
                SleepSession.external_id == external_id,
            )
        )

    def overlaps(self, user_id, start, end, exclude_id=None):
        query = select(SleepSession.id).where(
            SleepSession.user_id == user_id,
            SleepSession.started_at < end,
            SleepSession.ended_at > start,
        )
        if exclude_id:
            query = query.where(SleepSession.id != exclude_id)
        return self.session.scalar(query.limit(1)) is not None
