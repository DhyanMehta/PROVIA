from sqlalchemy import func, select
from sqlalchemy.orm import lazyload

from app.core.exceptions import AppError
from app.db.models import (
    DailyActivity,
    FitnessGoal,
    GoalTransition,
    MealItem,
    MealLog,
    SleepSession,
    WaterLog,
    WaterTarget,
    WeightLog,
    WorkoutSession,
    WorkoutSet,
)
from app.modules.tracking.repository import TrackingRepository


class InsightsRepository(TrackingRepository):
    def workout_count(self, user_id, start, end, exercise_id=None):
        query = (
            select(func.count())
            .select_from(WorkoutSession)
            .where(
                WorkoutSession.user_id == user_id,
                WorkoutSession.status == "completed",
                WorkoutSession.started_at >= start,
                WorkoutSession.started_at < end,
            )
        )
        if exercise_id is not None:
            query = query.where(
                select(WorkoutSet.id)
                .where(
                    WorkoutSet.workout_session_id == WorkoutSession.id,
                    WorkoutSet.exercise_id == exercise_id,
                )
                .exists()
            )
        return self.session.scalar(query)

    def activities(self, user_id, first, last):
        return self.bounded(
            select(DailyActivity)
            .where(
                DailyActivity.user_id == user_id,
                DailyActivity.activity_date >= first,
                DailyActivity.activity_date <= last,
            )
            .order_by(DailyActivity.activity_date)
        )

    def bounded(self, query):
        rows = self.session.scalars(query.limit(10001)).all()
        if len(rows) > 10000:
            raise AppError("ANALYTICS_LIMIT", "Too many records; request a shorter date range", 422)
        return rows

    def range_records(self, model, user_id, column, start, end):
        return self.bounded(
            select(model)
            .where(model.user_id == user_id, column >= start, column < end)
            .options(lazyload("*"))
        )

    def workouts(self, user_id, start, end):
        sessions = self.range_records(
            WorkoutSession, user_id, WorkoutSession.started_at, start, end
        )
        sets = self.bounded(
            select(WorkoutSet)
            .join(WorkoutSession)
            .where(
                WorkoutSession.user_id == user_id,
                WorkoutSession.started_at >= start,
                WorkoutSession.started_at < end,
            )
        )
        return sessions, sets

    def tracking(self, user_id, start_day, end_day, start, end):
        return {
            "water": self.range_records(WaterLog, user_id, WaterLog.consumed_at, start, end),
            "activity": self.bounded(
                select(DailyActivity).where(
                    DailyActivity.user_id == user_id,
                    DailyActivity.activity_date >= start_day,
                    DailyActivity.activity_date <= end_day,
                )
            ),
            "sleep": self.range_records(SleepSession, user_id, SleepSession.ended_at, start, end),
            "weight": self.range_records(WeightLog, user_id, WeightLog.recorded_at, start, end),
        }

    def targets(self, user_id, start_day, end_day):
        prior = self.target(user_id, start_day)
        later = self.bounded(
            select(WaterTarget)
            .where(
                WaterTarget.user_id == user_id,
                WaterTarget.effective_date > start_day,
                WaterTarget.effective_date <= end_day,
            )
            .order_by(WaterTarget.effective_date)
        )
        return ([prior] if prior else []) + later

    def nutrition(self, user_id, start, end):
        meals = self.range_records(MealLog, user_id, MealLog.consumed_at, start, end)
        items = self.bounded(
            select(MealItem)
            .join(MealLog)
            .where(
                MealLog.user_id == user_id, MealLog.consumed_at >= start, MealLog.consumed_at < end
            )
        )
        prior = self.session.scalar(
            select(GoalTransition)
            .where(GoalTransition.user_id == user_id, GoalTransition.effective_at < start)
            .order_by(GoalTransition.effective_at.desc())
            .limit(1)
        )
        changes = self.bounded(
            select(GoalTransition)
            .where(
                GoalTransition.user_id == user_id,
                GoalTransition.effective_at >= start,
                GoalTransition.effective_at < end,
            )
            .order_by(GoalTransition.effective_at)
        )
        transitions = ([prior] if prior else []) + changes
        ids = {row.goal_id for row in transitions if row.goal_id}
        goals = self.bounded(
            select(FitnessGoal).where(FitnessGoal.user_id == user_id, FitnessGoal.id.in_(ids))
        )
        return meals, items, transitions, {goal.id: goal for goal in goals}

    def latest_weight(self, user_id, end):
        return self.session.scalar(
            select(WeightLog)
            .where(WeightLog.user_id == user_id, WeightLog.recorded_at < end)
            .order_by(WeightLog.recorded_at.desc(), WeightLog.id)
            .limit(1)
        )
