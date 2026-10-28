from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AliasChoices, AwareDatetime, Field, field_validator, model_validator

from app.modules.common import Input, Output, Weight
from app.modules.nutrition.schemas import GoalCalculationOut

GoalType = Literal["weight_loss", "muscle_gain", "maintenance", "general_fitness"]
GoalStatus = Literal["active", "completed", "paused"]


class WeightGoalPreview(GoalCalculationOut):
    base_goal_id: UUID
    weight_log_id: UUID


class WeightGoalConfirmation(Input):
    expected_goal_id: UUID
    expected_weight_kg: Weight


class ProfilePut(Input):
    display_name: Annotated[str, Field(min_length=1, max_length=100)]
    date_of_birth: date | None = None
    height_cm: Annotated[Decimal, Field(gt=0, le=300, decimal_places=2)]
    current_weight_kg: Weight
    activity_level: Literal["sedentary", "light", "moderate", "active", "very_active"]
    preferred_weight_unit: Literal["kg", "lb"] = "kg"
    timezone: str = "UTC"

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Use an IANA timezone") from None
        return value

    @field_validator("date_of_birth")
    @classmethod
    def valid_birth_date(cls, value):
        if value is not None and (value > datetime.now(UTC).date() or value.year < 1900):
            raise ValueError("Birth date is outside the supported range")
        return value


class ProfileOut(ProfilePut, Output):
    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime


class OnboardingOut(Output):
    authenticated: bool = True
    email_verified: bool
    profile_exists: bool
    onboarding_complete: bool
    active_goal_exists: bool
    next_step: Literal["verify_email", "profile", "goal", "dashboard"]
    profile: ProfileOut | None
    active_goal: "GoalOut | None"


class GoalCreate(Input):
    goal_type: GoalType = "weight_loss"
    current_weight_kg: Weight | None = None
    target_weight_kg: Weight
    selected_deficit_kcal: Annotated[
        Decimal,
        Field(
            ge=0,
            le=24000,
            decimal_places=3,
            validation_alias=AliasChoices("selected_deficit_kcal", "deficit_kcal"),
        ),
    ]
    daily_steps_target: Annotated[int, Field(ge=0, le=200000)] | None = None
    status: GoalStatus = "active"


class GoalPatch(Input):
    goal_type: GoalType | None = None
    status: GoalStatus | None = None
    current_weight_kg: Weight | None = None
    target_weight_kg: Weight | None = None
    selected_deficit_kcal: Annotated[
        Decimal | None,
        Field(
            ge=0,
            le=24000,
            decimal_places=3,
            validation_alias=AliasChoices("selected_deficit_kcal", "deficit_kcal"),
        ),
    ] = None
    daily_steps_target: Annotated[int, Field(ge=0, le=200000)] | None = None

    @model_validator(mode="after")
    def required_if_supplied(self):
        if any(
            name in self.model_fields_set and getattr(self, name) is None
            for name in (
                "goal_type",
                "status",
                "current_weight_kg",
                "target_weight_kg",
                "selected_deficit_kcal",
            )
        ):
            raise ValueError("Goal type and status cannot be null")
        return self


class GoalOut(Output):
    id: UUID
    user_id: UUID
    goal_type: GoalType
    status: GoalStatus
    current_weight_kg_snapshot: Decimal | None
    target_weight_kg: Decimal | None
    selected_deficit_kcal: Decimal | None
    maintenance_calories: Decimal | None
    daily_calorie_target: Decimal | None
    protein_target_g: Decimal | None
    protein_target_kcal: Decimal | None
    carbs_target_g: Decimal | None
    carbs_target_kcal: Decimal | None
    fat_target_g: Decimal | None
    fat_target_kcal: Decimal | None
    fiber_target_g: Decimal | None
    daily_steps_target: int | None
    calculation_method: str | None
    calculation_version: str | None
    created_at: datetime
    updated_at: datetime


class WeightCreate(Input):
    weight_kg: Weight
    recorded_at: AwareDatetime = Field(default_factory=lambda: datetime.now(UTC))
    source: Literal["manual", "health_connect"] = "manual"
    external_id: Annotated[str, Field(min_length=1, max_length=200)] | None = None

    @model_validator(mode="after")
    def source_identity(self):
        if (self.source == "health_connect") != (self.external_id is not None):
            raise ValueError("Only Health Connect records require an external record ID")
        return self

    @field_validator("recorded_at")
    @classmethod
    def utc_timestamp(cls, value):
        if value > datetime.now(UTC):
            raise ValueError("Weight log cannot be in the future")
        return value.astimezone(UTC)


class WeightPatch(Input):
    weight_kg: Weight | None = None
    recorded_at: AwareDatetime | None = None

    @model_validator(mode="after")
    def required_if_supplied(self):
        if not self.model_fields_set or any(
            getattr(self, name) is None for name in self.model_fields_set
        ):
            raise ValueError("Supply at least one non-null measurement field")
        return self

    @field_validator("recorded_at")
    @classmethod
    def utc_timestamp(cls, value):
        return WeightCreate.utc_timestamp(value) if value is not None else None


class WeightOut(Output):
    id: UUID
    user_id: UUID
    weight_kg: Decimal
    recorded_at: datetime
    created_at: datetime
    source: Literal["manual", "health_connect"]
    external_id: str | None


OnboardingOut.model_rebuild()
