from pydantic import ValidationError

from app.core.exceptions import AppError
from app.db.models import (
    Exercise,
    PlannedExercise,
    WorkoutPlan,
    WorkoutPlanDay,
    WorkoutSession,
    WorkoutSet,
)
from app.modules.workouts.schemas import DayOut, SetCreate


class WorkoutService:
    def __init__(self, repository):
        self.repository = repository

    def create_exercise(self, user_id, data):
        self.repository.lock_user(user_id)
        return self.repository.save(Exercise(created_by_user_id=user_id, **data.model_dump()))

    def edit_exercise(self, user_id, row_id, data=None):
        self.repository.lock_user(user_id)
        row = self.repository.exercise(user_id, row_id, editable=True)
        if data is None:
            row.is_archived = True
        else:
            for key, value in data.model_dump(exclude_unset=True).items():
                setattr(row, key, value)
        return self.repository.save(row)

    def plan(self, user_id, data, row_id=None):
        self.repository.lock_user(user_id)
        row = (
            self.repository.owned(WorkoutPlan, user_id, row_id, lock=True)
            if row_id
            else WorkoutPlan(user_id=user_id)
        )
        if data.days is not None:
            self.repository.validate_references(
                user_id, {ex.exercise_id for day in data.days for ex in day.exercises}
            )
        if data.is_active:
            self.repository.deactivate(user_id)
        values = data.model_dump(exclude={"days"}, exclude_unset=row_id is not None)
        for key, value in values.items():
            setattr(row, key, value)
        if data.days is not None:
            if row_id:
                # Flush deletion before insertion to avoid schedule uniqueness conflicts.
                row.days.clear()
                self.repository.save(row)
            row.days = [
                WorkoutPlanDay(
                    **day.model_dump(exclude={"exercises"}),
                    exercises=[PlannedExercise(**ex.model_dump()) for ex in day.exercises],
                )
                for day in data.days
            ]
        return self.repository.save(row)

    def delete_plan(self, user_id, row_id):
        self.repository.lock_user(user_id)
        self.repository.delete(self.repository.owned(WorkoutPlan, user_id, row_id, lock=True))

    def start(self, user_id, data):
        self.repository.lock_user(user_id)
        if self.repository.active_session(user_id) is not None:
            raise AppError(
                "ACTIVE_WORKOUT_EXISTS", "Complete or cancel the active workout first", 409
            )
        snapshot = None
        if data.workout_plan_day_id:
            plan, day = self.repository.plan_for_day(user_id, data.workout_plan_day_id)
            if day.is_rest:
                raise AppError("REST_DAY", "Start an unplanned session for a rest day", 422)
            self.repository.validate_references(user_id, {ex.exercise_id for ex in day.exercises})
            snapshot = {
                "plan_id": str(plan.id),
                "plan_name": plan.name,
                "day": DayOut.model_validate(day).model_dump(mode="json"),
            }
        return self.repository.save(
            WorkoutSession(user_id=user_id, plan_snapshot=snapshot, **data.model_dump())
        )

    def mutable_session(self, user_id, row_id, set_id=None):
        row = self.repository.owned(WorkoutSession, user_id, row_id, lock=True)
        # Resolve nested ownership before exposing lifecycle state. A set under
        # another parent is always missing, even when this parent is completed.
        if set_id is not None and not any(item.id == set_id for item in row.sets):
            raise AppError("RESOURCE_NOT_FOUND", "Set was not found", 404)
        if row.status != "in_progress":
            raise AppError(
                "INVALID_SESSION_STATE", "Only in-progress workouts can be modified", 409
            )
        return row

    def edit_session(self, user_id, row_id, data):
        row = self.mutable_session(user_id, row_id)
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(row, key, value)
        return self.repository.save(row)

    def complete(self, user_id, row_id, data):
        row = self.mutable_session(user_id, row_id)
        if data.completed_at <= row.started_at:
            raise AppError("INVALID_INTERVAL", "Completion must follow workout start", 422)
        if any(not (item.is_completed or item.is_skipped) for item in row.sets):
            raise AppError("UNFINISHED_SETS", "Complete or skip every recorded set first", 409)
        row.status = "completed"
        row.completed_at = data.completed_at
        return self.repository.save(row)

    def set(self, user_id, session_id, data, set_id=None):
        # Match lock order used by plan/exercise mutations, then lock the session.
        self.repository.lock_user(user_id)
        workout = self.mutable_session(user_id, session_id, set_id=set_id)
        if set_id:
            row = next((row for row in workout.sets if row.id == set_id), None)
            if row is None:
                raise AppError("RESOURCE_NOT_FOUND", "Set was not found", 404)
            values = {key: getattr(row, key) for key in SetCreate.model_fields}
            values.update(data.model_dump(exclude_unset=True))
            try:
                data = SetCreate.model_validate(values)
            except ValidationError:
                raise AppError("INVALID_SET", "Invalid completed or skipped set", 422) from None
            for key, value in data.model_dump().items():
                setattr(row, key, value)
        else:
            if len(workout.sets) >= 500:
                raise AppError("SET_LIMIT", "A workout supports at most 500 sets", 422)
            exercise = self.repository.exercise(user_id, data.exercise_id)
            row = WorkoutSet(
                workout_session_id=session_id,
                exercise_name_snapshot=exercise.name,
                **data.model_dump(),
            )
        return self.repository.save(row)

    def delete_set(self, user_id, session_id, set_id):
        workout = self.mutable_session(user_id, session_id, set_id=set_id)
        row = next((row for row in workout.sets if row.id == set_id), None)
        if row is None:
            raise AppError("RESOURCE_NOT_FOUND", "Set was not found", 404)
        self.repository.delete(row)
