from sqlalchemy import or_, select, update

from app.core.exceptions import AppError
from app.db.models import Exercise, WorkoutPlan, WorkoutPlanDay, WorkoutSession
from app.modules.tracking.repository import TrackingRepository


class WorkoutRepository(TrackingRepository):
    @staticmethod
    def visible(user_id):
        return or_(Exercise.created_by_user_id.is_(None), Exercise.created_by_user_id == user_id)

    def exercise(self, user_id, exercise_id, editable=False, allow_archived=False):
        query = select(Exercise).where(Exercise.id == exercise_id, self.visible(user_id))
        if not allow_archived:
            query = query.where(Exercise.is_archived.is_(False))
        if editable:
            query = query.where(Exercise.created_by_user_id == user_id).with_for_update()
        row = self.session.scalar(query)
        if row is None:
            raise AppError("RESOURCE_NOT_FOUND", "Exercise was not found", 404)
        return row

    def exercises(self, user_id, query, muscle_group, equipment, category, limit, offset):
        statement = select(Exercise).where(self.visible(user_id), Exercise.is_archived.is_(False))
        if query:
            statement = statement.where(Exercise.name.icontains(query, autoescape=True))
        for column, value in [
            (Exercise.muscle_group, muscle_group),
            (Exercise.equipment, equipment),
            (Exercise.category, category),
        ]:
            if value is not None:
                statement = statement.where(column == value)
        return self.session.scalars(
            statement.order_by(Exercise.name, Exercise.id).limit(limit).offset(offset)
        ).all()

    def validate_references(self, user_id, ids):
        found = set(
            self.session.scalars(
                select(Exercise.id).where(
                    Exercise.id.in_(ids), self.visible(user_id), Exercise.is_archived.is_(False)
                )
            )
        )
        if found != set(ids):
            raise AppError("RESOURCE_NOT_FOUND", "One or more exercises were not found", 404)

    def plans(self, user_id, limit, offset):
        return self.session.scalars(
            select(WorkoutPlan)
            .where(WorkoutPlan.user_id == user_id)
            .order_by(WorkoutPlan.created_at.desc(), WorkoutPlan.id)
            .limit(limit)
            .offset(offset)
        ).all()

    def active_session(self, user_id):
        # Existing imports can contain multiple open rows. Never rewrite history;
        # expose the newest and allow all of them to be resolved through the list.
        return self.session.scalar(
            select(WorkoutSession)
            .where(WorkoutSession.user_id == user_id, WorkoutSession.status == "in_progress")
            .order_by(WorkoutSession.started_at.desc(), WorkoutSession.id)
            .limit(1)
        )

    def sessions(self, user_id, begin, finish, status, limit, offset):
        statement = select(WorkoutSession).where(
            WorkoutSession.user_id == user_id,
            WorkoutSession.started_at >= begin,
            WorkoutSession.started_at < finish,
        )
        if status is not None:
            statement = statement.where(WorkoutSession.status == status)
        return self.session.scalars(
            statement.order_by(WorkoutSession.started_at, WorkoutSession.id)
            .limit(limit)
            .offset(offset)
        ).all()

    def deactivate(self, user_id):
        self.session.execute(
            update(WorkoutPlan)
            .where(WorkoutPlan.user_id == user_id, WorkoutPlan.is_active.is_(True))
            .values(is_active=False)
        )

    def plan_for_day(self, user_id, day_id):
        plan = self.session.scalar(
            select(WorkoutPlan)
            .join(WorkoutPlanDay)
            .where(WorkoutPlan.user_id == user_id, WorkoutPlanDay.id == day_id)
        )
        if plan is None:
            raise AppError("RESOURCE_NOT_FOUND", "Workout plan day was not found", 404)
        return plan, next(day for day in plan.days if day.id == day_id)
