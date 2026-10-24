from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, model_validator

from app.modules.common import Input, Output
from app.modules.tracking.schemas import Notes, Timestamp

Name = Annotated[str, Field(min_length=1, max_length=200)]
Load = Annotated[Decimal, Field(ge=0, le=10000, max_digits=8, decimal_places=3)]
Seconds = Annotated[int, Field(ge=0, le=86400)]
Category = Literal["strength", "cardio", "mobility", "flexibility", "bodyweight"]
Difficulty = Literal["beginner", "intermediate", "advanced"]


class ExerciseCreate(Input):
    name: Name
    muscle_group: Annotated[str, Field(min_length=1, max_length=100)]
    equipment: Annotated[str, Field(min_length=1, max_length=100)]
    instructions: Notes | None = None
    description: Notes | None = None
    secondary_muscles: Annotated[
        list[Annotated[str, Field(min_length=1, max_length=100)]], Field(max_length=20)
    ] = []
    category: Category
    movement_type: Annotated[str, Field(max_length=100)] | None = None
    difficulty: Difficulty | None = None
    media_reference: Annotated[str, Field(max_length=1000, pattern=r"^https://")] | None = None


class ExercisePatch(Input):
    name: Name | None = None
    muscle_group: Annotated[str, Field(min_length=1, max_length=100)] | None = None
    equipment: Annotated[str, Field(min_length=1, max_length=100)] | None = None
    instructions: Notes | None = None
    description: Notes | None = None
    secondary_muscles: (
        Annotated[list[Annotated[str, Field(min_length=1, max_length=100)]], Field(max_length=20)]
        | None
    ) = None
    category: Category | None = None
    movement_type: Annotated[str, Field(max_length=100)] | None = None
    difficulty: Difficulty | None = None
    media_reference: Annotated[str, Field(max_length=1000, pattern=r"^https://")] | None = None

    @model_validator(mode="after")
    def required_values(self):
        for key in {
            "name",
            "muscle_group",
            "equipment",
            "secondary_muscles",
            "category",
        } & self.model_fields_set:
            if getattr(self, key) is None:
                raise ValueError("Required exercise fields cannot be null")
        return self


class ExerciseOut(Output):
    id: UUID
    name: str
    muscle_group: str
    equipment: str
    instructions: str | None
    description: str | None
    secondary_muscles: list[str]
    category: str | None
    movement_type: str | None
    difficulty: str | None
    media_reference: str | None
    created_by_user_id: UUID | None
    is_archived: bool


class PlannedInput(Input):
    exercise_id: UUID
    order_index: Annotated[int, Field(ge=0, le=100)]
    target_sets: Annotated[int, Field(gt=0, le=100)]
    target_reps: Annotated[int, Field(gt=0, le=10000)]
    target_weight_kg: Load | None = None
    rest_seconds: Seconds | None = None
    notes: Notes | None = None


class DayInput(Input):
    day_of_week: Annotated[int, Field(ge=0, le=6)]
    name: Annotated[str, Field(min_length=1, max_length=100)]
    is_rest: bool = False
    exercises: Annotated[list[PlannedInput], Field(max_length=50)] = []

    @model_validator(mode="after")
    def validate_exercises(self):
        if self.is_rest and self.exercises:
            raise ValueError("Rest days cannot contain exercises")
        if len({row.order_index for row in self.exercises}) != len(self.exercises):
            raise ValueError("Exercise order must be unique within a day")
        return self


class PlanCreate(Input):
    name: Name
    description: Notes | None = None
    goal: Name | None = None
    is_active: bool = True
    days: Annotated[list[DayInput], Field(max_length=7)] = []

    @model_validator(mode="after")
    def unique_days(self):
        if len({row.day_of_week for row in self.days}) != len(self.days):
            raise ValueError("Schedule days must be unique")
        return self


class PlanPatch(Input):
    name: Name | None = None
    description: Notes | None = None
    goal: Name | None = None
    is_active: bool | None = None
    days: Annotated[list[DayInput], Field(max_length=7)] | None = None

    @model_validator(mode="after")
    def valid_patch(self):
        for key in {"name", "is_active", "days"} & self.model_fields_set:
            if getattr(self, key) is None:
                raise ValueError("Required plan fields cannot be null")
        if self.days and len({row.day_of_week for row in self.days}) != len(self.days):
            raise ValueError("Schedule days must be unique")
        return self


class PlannedOut(Output):
    id: UUID
    exercise_id: UUID
    order_index: int
    target_sets: int
    target_reps: int
    target_weight_kg: Decimal | None
    rest_seconds: int | None
    notes: str | None


class DayOut(Output):
    id: UUID
    day_of_week: int
    name: str
    is_rest: bool
    exercises: list[PlannedOut]


class PlanOut(Output):
    id: UUID
    name: str
    description: str | None
    goal: str | None
    is_active: bool
    days: list[DayOut]


class SessionCreate(Input):
    workout_plan_day_id: UUID | None = None
    started_at: Timestamp
    notes: Notes | None = None


class SessionPatch(Input):
    notes: Notes | None = None
    status: Literal["cancelled"] | None = None

    @model_validator(mode="after")
    def status_not_null(self):
        if "status" in self.model_fields_set and self.status is None:
            raise ValueError("Status cannot be null")
        return self


class CompleteInput(Input):
    completed_at: Timestamp


class SetCreate(Input):
    exercise_id: UUID
    set_number: Annotated[int, Field(gt=0, le=1000)]
    reps: Annotated[int, Field(ge=0, le=10000)] = 0
    weight_kg: Load = Decimal(0)
    kind: Literal["warmup", "working"] = "working"
    is_completed: bool = False
    is_skipped: bool = False
    duration_seconds: Seconds | None = None
    rest_seconds: Seconds | None = None
    notes: Notes | None = None

    @model_validator(mode="after")
    def completion(self):
        if self.is_completed and self.is_skipped:
            raise ValueError("A set cannot be both completed and skipped")
        if self.is_completed and not (self.reps or self.duration_seconds):
            raise ValueError("Completed sets require repetitions or duration")
        return self


class SetPatch(Input):
    set_number: Annotated[int, Field(gt=0, le=1000)] | None = None
    reps: Annotated[int, Field(ge=0, le=10000)] | None = None
    weight_kg: Load | None = None
    kind: Literal["warmup", "working"] | None = None
    is_completed: bool | None = None
    is_skipped: bool | None = None
    duration_seconds: Seconds | None = None
    rest_seconds: Seconds | None = None
    notes: Notes | None = None

    @model_validator(mode="after")
    def no_null(self):
        for key in self.model_fields_set - {"duration_seconds", "rest_seconds", "notes"}:
            if getattr(self, key) is None:
                raise ValueError("Required set fields cannot be null")
        return self


class SetOut(Output):
    id: UUID
    exercise_id: UUID
    exercise_name_snapshot: str | None
    set_number: int
    reps: int
    weight_kg: Decimal
    kind: str
    is_completed: bool
    is_skipped: bool
    duration_seconds: int | None
    rest_seconds: int | None
    notes: str | None


class SessionOut(Output):
    id: UUID
    workout_plan_day_id: UUID | None
    started_at: datetime
    completed_at: datetime | None
    status: str
    notes: str | None
    plan_snapshot: dict | None
    sets: list[SetOut]
