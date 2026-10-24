"""Initial MVP schema. Shared catalogs are restricted, never cascade-deleted."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Identity:
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


class Created:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Updated:
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class User(Identity, Created, Updated, Base):
    __tablename__ = "users"
    auth_provider_subject: Mapped[str] = mapped_column(String(255), unique=True)
    email: Mapped[str | None] = mapped_column(String(320))


class UserProfile(Identity, Created, Updated, Base):
    __tablename__ = "user_profiles"
    __table_args__ = (
        CheckConstraint("height_cm > 0 AND height_cm <= 300", name="height_range"),
        CheckConstraint("current_weight_kg > 0 AND current_weight_kg <= 1000", name="weight_range"),
        CheckConstraint(
            "activity_level IN ('sedentary','light','moderate','active','very_active')",
            name="activity_level",
        ),
        CheckConstraint("preferred_weight_unit IN ('kg','lb')", name="weight_unit"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    display_name: Mapped[str] = mapped_column(String(100))
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    height_cm: Mapped[Decimal] = mapped_column(Numeric(7, 2))
    current_weight_kg: Mapped[Decimal] = mapped_column(Numeric(8, 3))
    activity_level: Mapped[str] = mapped_column(String(20))
    preferred_weight_unit: Mapped[str] = mapped_column(String(2), default="kg")
    timezone: Mapped[str] = mapped_column(String(100), default="UTC")


class FitnessGoal(Identity, Created, Updated, Base):
    __tablename__ = "fitness_goals"
    __table_args__ = (
        CheckConstraint(
            "goal_type IN ('weight_loss','muscle_gain','maintenance','general_fitness')",
            name="goal_type",
        ),
        CheckConstraint("status IN ('active','completed','paused')", name="status"),
        CheckConstraint("target_weight_kg > 0 AND target_weight_kg <= 1000", name="target_weight"),
        CheckConstraint("daily_calorie_target >= 0", name="calories_nonnegative"),
        CheckConstraint(
            "protein_target_g >= 0 AND carbs_target_g >= 0 AND fat_target_g >= 0 "
            "AND fiber_target_g >= 0",
            name="nutrients_nonnegative",
        ),
        CheckConstraint("daily_steps_target >= 0", name="steps_nonnegative"),
        CheckConstraint(
            "current_weight_kg_snapshot > 0 AND current_weight_kg_snapshot <= 1000",
            name="snapshot_weight",
        ),
        CheckConstraint(
            "selected_deficit_kcal >= 0 AND selected_deficit_kcal < maintenance_calories",
            name="deficit_range",
        ),
        CheckConstraint(
            "calculation_method IS NULL OR (calculation_method = 'weight_x_24' "
            "AND calculation_version IS NOT NULL AND current_weight_kg_snapshot IS NOT NULL "
            "AND target_weight_kg IS NOT NULL AND selected_deficit_kcal IS NOT NULL "
            "AND maintenance_calories IS NOT NULL AND daily_calorie_target IS NOT NULL "
            "AND protein_target_g IS NOT NULL AND protein_target_kcal IS NOT NULL "
            "AND carbs_target_g IS NOT NULL AND carbs_target_kcal IS NOT NULL "
            "AND fat_target_g IS NOT NULL AND fat_target_kcal IS NOT NULL "
            "AND fiber_target_g IS NOT NULL AND daily_calorie_target > 0 "
            "AND carbs_target_g > 0)",
            name="calculation_snapshot_complete",
        ),
        Index(
            "uq_fitness_goals_active_user",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
        Index("ix_fitness_goals_user_created", "user_id", "created_at"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    goal_type: Mapped[str] = mapped_column(String(30))
    target_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))
    daily_calorie_target: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    protein_target_g: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    carbs_target_g: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    fat_target_g: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    fiber_target_g: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    daily_steps_target: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="active")
    current_weight_kg_snapshot: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))
    selected_deficit_kcal: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    maintenance_calories: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    protein_target_kcal: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    carbs_target_kcal: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    fat_target_kcal: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    calculation_method: Mapped[str | None] = mapped_column(String(40))
    calculation_version: Mapped[str | None] = mapped_column(String(20))


class WeightLog(Identity, Created, Base):
    __tablename__ = "weight_logs"
    __table_args__ = (
        CheckConstraint("weight_kg > 0 AND weight_kg <= 1000", name="weight_range"),
        Index("ix_weight_logs_user_recorded", "user_id", "recorded_at"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    weight_kg: Mapped[Decimal] = mapped_column(Numeric(8, 3))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class GoalTransition(Identity, Created, Base):
    """Append-only activation/pause events; null goal means no target in force."""

    __tablename__ = "goal_transitions"
    __table_args__ = (UniqueConstraint("user_id", "effective_at"),)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    goal_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("fitness_goals.id", ondelete="RESTRICT")
    )
    effective_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Food(Identity, Created, Updated, Base):
    __tablename__ = "foods"
    __table_args__ = (
        CheckConstraint(
            "food_kind IN ('unspecified','ingredient','prepared_dish','recipe')", name="food_kind"
        ),
        UniqueConstraint("source", "source_food_id"),
        CheckConstraint(
            "source IN ('custom','usda','open_food_facts','indian_curated')", name="source"
        ),
        CheckConstraint(
            "source <> 'indian_curated' OR (source_url IS NOT NULL "
            "AND license_name IS NOT NULL AND verified_at IS NOT NULL)",
            name="curated_attribution",
        ),
        Index("ix_foods_aliases", "aliases", postgresql_using="gin"),
        CheckConstraint("serving_basis = '100g'", name="serving_basis"),
        CheckConstraint(
            "(source = 'custom' AND created_by_user_id IS NOT NULL) OR "
            "(source <> 'custom' AND source_food_id IS NOT NULL "
            "AND created_by_user_id IS NULL)",
            name="ownership",
        ),
        CheckConstraint(
            "calories_kcal >= 0 AND protein_g >= 0 AND carbs_g >= 0 "
            "AND fat_g >= 0 AND fiber_g >= 0",
            name="nutrients_nonnegative",
        ),
    )
    name: Mapped[str] = mapped_column(String(300), index=True)
    food_kind: Mapped[str] = mapped_column(
        String(20), default="unspecified", server_default="unspecified"
    )
    brand: Mapped[str | None] = mapped_column(String(200))
    aliases: Mapped[list[str]] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb")
    )
    source_url: Mapped[str | None] = mapped_column(String(1000))
    license_name: Mapped[str | None] = mapped_column(String(200))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source: Mapped[str] = mapped_column(String(30))
    source_food_id: Mapped[str | None] = mapped_column(String(100))
    serving_basis: Mapped[str] = mapped_column(String(10), default="100g")
    calories_kcal: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    protein_g: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    carbs_g: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    fat_g: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    fiber_g: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    portions: Mapped[list["FoodPortion"]] = relationship(
        lazy="selectin", cascade="all, delete-orphan"
    )


class Recipe(Identity, Created, Base):
    __tablename__ = "recipes"
    __table_args__ = (CheckConstraint("yield_g > 0 AND yield_g <= 100000", name="yield_range"),)
    food_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("foods.id", ondelete="RESTRICT"), unique=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    yield_g: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    incomplete: Mapped[bool] = mapped_column(Boolean)
    ingredients: Mapped[list["RecipeIngredient"]] = relationship(
        lazy="selectin", cascade="all, delete-orphan"
    )


class RecipeIngredient(Identity, Base):
    __tablename__ = "recipe_ingredients"
    __table_args__ = (
        UniqueConstraint("recipe_id", "food_id"),
        CheckConstraint("quantity_g > 0 AND quantity_g <= 100000", name="quantity_range"),
        CheckConstraint(
            "calories_kcal_snapshot >= 0 AND protein_g_snapshot >= 0 "
            "AND carbs_g_snapshot >= 0 AND fat_g_snapshot >= 0 AND fiber_g_snapshot >= 0",
            name="nutrients_nonnegative",
        ),
    )
    recipe_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("recipes.id", ondelete="CASCADE"))
    food_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("foods.id", ondelete="RESTRICT"))
    quantity_g: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    calories_kcal_snapshot: Mapped[Decimal | None] = mapped_column(Numeric(20, 8))
    protein_g_snapshot: Mapped[Decimal | None] = mapped_column(Numeric(20, 8))
    carbs_g_snapshot: Mapped[Decimal | None] = mapped_column(Numeric(20, 8))
    fat_g_snapshot: Mapped[Decimal | None] = mapped_column(Numeric(20, 8))
    fiber_g_snapshot: Mapped[Decimal | None] = mapped_column(Numeric(20, 8))


class FoodPortion(Identity, Created, Base):
    __tablename__ = "food_portions"
    __table_args__ = (
        CheckConstraint("grams > 0", name="positive_grams"),
        UniqueConstraint("food_id", "label"),
    )
    food_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("foods.id", ondelete="CASCADE"))
    label: Mapped[str] = mapped_column(String(100))
    grams: Mapped[Decimal] = mapped_column(Numeric(12, 3))


class MealLog(Identity, Created, Updated, Base):
    __tablename__ = "meal_logs"
    __table_args__ = (
        CheckConstraint("meal_type IN ('breakfast','lunch','dinner','snack')", name="meal_type"),
        Index("ix_meal_logs_user_consumed", "user_id", "consumed_at"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    meal_type: Mapped[str] = mapped_column(String(20))
    consumed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    items: Mapped[list["MealItem"]] = relationship(
        lazy="selectin", cascade="all, delete-orphan", order_by="MealItem.created_at"
    )


class MealItem(Identity, Created, Base):
    __tablename__ = "meal_items"
    __table_args__ = (
        CheckConstraint("quantity_g > 0", name="positive_quantity"),
        CheckConstraint(
            "calories_kcal_snapshot >= 0 AND protein_g_snapshot >= 0 "
            "AND carbs_g_snapshot >= 0 AND fat_g_snapshot >= 0 "
            "AND fiber_g_snapshot >= 0",
            name="snapshots_nonnegative",
        ),
    )
    meal_log_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("meal_logs.id", ondelete="CASCADE"), index=True
    )
    food_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("foods.id", ondelete="RESTRICT"), index=True
    )
    quantity_g: Mapped[Decimal] = mapped_column(Numeric(12, 3))
    calories_kcal_snapshot: Mapped[Decimal | None] = mapped_column(Numeric(16, 3))
    protein_g_snapshot: Mapped[Decimal | None] = mapped_column(Numeric(16, 3))
    carbs_g_snapshot: Mapped[Decimal | None] = mapped_column(Numeric(16, 3))
    fat_g_snapshot: Mapped[Decimal | None] = mapped_column(Numeric(16, 3))
    fiber_g_snapshot: Mapped[Decimal | None] = mapped_column(Numeric(16, 3))


class Exercise(Identity, Created, Base):
    __tablename__ = "exercises"
    name: Mapped[str] = mapped_column(String(200), index=True)
    muscle_group: Mapped[str] = mapped_column(String(100))
    equipment: Mapped[str] = mapped_column(String(100))
    instructions: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    secondary_muscles: Mapped[list[str]] = mapped_column(
        JSONB, default=list, server_default=text("'[]'::jsonb")
    )
    category: Mapped[str | None] = mapped_column(String(30))
    movement_type: Mapped[str | None] = mapped_column(String(100))
    difficulty: Mapped[str | None] = mapped_column(String(30))
    media_reference: Mapped[str | None] = mapped_column(String(1000))
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )


class WorkoutPlan(Identity, Created, Updated, Base):
    __tablename__ = "workout_plans"
    __table_args__ = (
        Index(
            "uq_workout_plans_active_user",
            "user_id",
            unique=True,
            postgresql_where=text("is_active"),
        ),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    goal: Mapped[str | None] = mapped_column(String(200))
    days: Mapped[list["WorkoutPlanDay"]] = relationship(
        lazy="selectin", cascade="all, delete-orphan", order_by="WorkoutPlanDay.day_of_week"
    )


class WorkoutPlanDay(Identity, Created, Base):
    __tablename__ = "workout_plan_days"
    __table_args__ = (
        CheckConstraint("day_of_week BETWEEN 0 AND 6", name="day_range"),
        UniqueConstraint("workout_plan_id", "day_of_week"),
    )
    workout_plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workout_plans.id", ondelete="CASCADE")
    )
    day_of_week: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(100))
    is_rest: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    exercises: Mapped[list["PlannedExercise"]] = relationship(
        lazy="selectin", cascade="all, delete-orphan", order_by="PlannedExercise.order_index"
    )


class PlannedExercise(Identity, Created, Base):
    __tablename__ = "planned_exercises"
    __table_args__ = (
        CheckConstraint("order_index >= 0 AND target_sets > 0 AND target_reps > 0", name="targets"),
        UniqueConstraint("workout_plan_day_id", "order_index"),
        CheckConstraint("target_weight_kg >= 0 AND rest_seconds >= 0", name="optional_targets"),
    )
    workout_plan_day_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workout_plan_days.id", ondelete="CASCADE")
    )
    exercise_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exercises.id", ondelete="RESTRICT"), index=True
    )
    order_index: Mapped[int] = mapped_column(Integer)
    target_sets: Mapped[int] = mapped_column(Integer)
    target_reps: Mapped[int] = mapped_column(Integer)
    target_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(8, 3))
    rest_seconds: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)


class WorkoutSession(Identity, Base):
    __tablename__ = "workout_sessions"
    __table_args__ = (
        CheckConstraint("completed_at >= started_at", name="time_order"),
        CheckConstraint("status IN ('in_progress','completed','cancelled')", name="status"),
        Index("ix_workout_sessions_user_started", "user_id", "started_at"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    workout_plan_day_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("workout_plan_days.id", ondelete="SET NULL"), index=True
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="in_progress")
    notes: Mapped[str | None] = mapped_column(Text)
    plan_snapshot: Mapped[dict | None] = mapped_column(JSONB)
    sets: Mapped[list["WorkoutSet"]] = relationship(
        lazy="selectin",
        cascade="all, delete-orphan",
        order_by="WorkoutSet.created_at, WorkoutSet.id",
    )


class WorkoutSet(Identity, Created, Base):
    __tablename__ = "workout_sets"
    __table_args__ = (
        CheckConstraint("set_number > 0 AND reps >= 0 AND weight_kg >= 0", name="values"),
        UniqueConstraint("workout_session_id", "exercise_id", "set_number"),
        CheckConstraint("kind IN ('warmup','working')", name="kind"),
        CheckConstraint("NOT (is_completed AND is_skipped)", name="completion"),
        CheckConstraint("duration_seconds >= 0 AND rest_seconds >= 0", name="duration"),
    )
    workout_session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("workout_sessions.id", ondelete="CASCADE")
    )
    exercise_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exercises.id", ondelete="RESTRICT"), index=True
    )
    set_number: Mapped[int] = mapped_column(Integer)
    reps: Mapped[int] = mapped_column(Integer)
    weight_kg: Mapped[Decimal] = mapped_column(Numeric(8, 3))
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    is_skipped: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    kind: Mapped[str] = mapped_column(String(20), default="working", server_default="working")
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    rest_seconds: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)
    exercise_name_snapshot: Mapped[str | None] = mapped_column(String(200))


class DailyActivity(Identity, Created, Updated, Base):
    __tablename__ = "daily_activity"
    __table_args__ = (
        UniqueConstraint("user_id", "activity_date"),
        CheckConstraint("steps >= 0 AND steps <= 200000", name="steps_range"),
        CheckConstraint("distance_m >= 0", name="distance_nonnegative"),
        CheckConstraint(
            "active_minutes BETWEEN 0 AND 1440 AND activity_calories >= 0", name="activity_values"
        ),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    activity_date: Mapped[date] = mapped_column(Date)
    steps: Mapped[int] = mapped_column(Integer)
    distance_m: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    source: Mapped[str] = mapped_column(String(50))
    active_minutes: Mapped[int | None] = mapped_column(Integer)
    activity_calories: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SleepSession(Identity, Created, Base):
    __tablename__ = "sleep_sessions"
    __table_args__ = (
        CheckConstraint(
            "ended_at > started_at AND ended_at <= started_at + INTERVAL '24 hours'",
            name="sleep_duration",
        ),
        Index("ix_sleep_sessions_user_started", "user_id", "started_at"),
        Index("ix_sleep_sessions_user_ended", "user_id", "ended_at"),
        UniqueConstraint("user_id", "source", "external_id"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    source: Mapped[str] = mapped_column(String(50))
    external_id: Mapped[str | None] = mapped_column(String(200))
    stages: Mapped[list[dict] | None] = mapped_column(JSONB)
    notes: Mapped[str | None] = mapped_column(Text)


class WaterLog(Identity, Created, Base):
    __tablename__ = "water_logs"
    __table_args__ = (
        CheckConstraint("amount_ml > 0 AND amount_ml <= 10000", name="amount_range"),
        Index("ix_water_logs_user_consumed", "user_id", "consumed_at"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    amount_ml: Mapped[Decimal] = mapped_column(Numeric(10, 3))
    consumed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class WaterTarget(Identity, Created, Base):
    __tablename__ = "water_targets"
    __table_args__ = (
        UniqueConstraint("user_id", "effective_date"),
        CheckConstraint("target_ml > 0 AND target_ml <= 20000", name="target_range"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    effective_date: Mapped[date] = mapped_column(Date)
    target_ml: Mapped[Decimal] = mapped_column(Numeric(10, 3))
