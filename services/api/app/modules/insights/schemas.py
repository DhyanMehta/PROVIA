from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from app.modules.common import Output
from app.modules.nutrition.schemas import DashboardOut as NutritionDashboard
from app.modules.tracking.schemas import ActivityOut, SleepOut, WaterOut
from app.modules.workouts.schemas import SetOut


class RangeOut(Output):
    start_date: date
    end_date: date
    timezone: str


class WorkoutPoint(Output):
    date: date
    count: int
    volume_kg: Decimal


class WorkoutHistory(Output):
    id: UUID
    date: date
    started_at: datetime
    duration_seconds: float | None
    volume_kg: Decimal
    sets: list[SetOut] | None


class PersonalRecord(Output):
    heaviest_weight_kg: Decimal | None
    highest_reps: int | None
    highest_session_volume_kg: Decimal


class WorkoutSummary(RangeOut):
    total_workouts: int
    workouts_this_week: int
    workouts_this_month: int
    total_duration_seconds: float | None
    total_volume_kg: Decimal
    active_days: int
    consistency_ratio: Decimal
    history: list[WorkoutHistory]
    daily: list[WorkoutPoint]
    personal_records: dict[str, PersonalRecord]


class WaterDay(Output):
    target_ml: Decimal | None
    consumed_ml: Decimal
    remaining_ml: Decimal | None
    has_logs: bool
    target_met: bool | None = None


class WaterDashboard(WaterDay):
    date: date
    timezone: str
    logs: list[WaterOut]


class SleepDay(Output):
    session_count: int
    duration_seconds: float | None


class MacroAdherence(Output):
    target_g: Decimal | None
    consumed_g: Decimal | None
    remaining_g: Decimal | None
    adherence_ratio: Decimal | None


class NutritionDay(Output):
    has_logs: bool
    calories_consumed: Decimal | None
    calories_target: Decimal | None
    goal_id: UUID | None
    adherence_ratio: Decimal | None
    protein: MacroAdherence
    carbs: MacroAdherence
    fat: MacroAdherence
    fiber: MacroAdherence


class ProgressDay(Output):
    date: date
    water: WaterDay
    activity: ActivityOut | None
    sleep: SleepDay
    nutrition: NutritionDay


class WeightSnapshot(Output):
    recorded_at: datetime
    weight_kg: Decimal


class WeightPoint(WeightSnapshot):
    id: UUID


class WaterConsistency(Output):
    observed_days_with_target: int
    days_met: int


class ProgressOverview(RangeOut):
    daily: list[ProgressDay]
    weight_history: list[WeightPoint]
    weight_change_kg: Decimal | None
    water_consistency: WaterConsistency
    workouts: WorkoutSummary


class DashboardGoal(Output):
    id: UUID
    goal_type: str
    target_weight_kg: Decimal | None
    current_weight_kg_snapshot: Decimal | None
    daily_steps_target: int | None


class DailyDashboard(Output):
    date: date
    timezone: str
    nutrition: NutritionDashboard
    water: WaterDay
    activity: ActivityOut | None
    sleep: SleepDay
    workouts: WorkoutSummary
    weight: WeightSnapshot | None
    goal: DashboardGoal | None


class SleepPoint(Output):
    date: date
    duration_seconds: float | None


class SleepSummary(RangeOut):
    assignment: str
    daily: list[SleepPoint]
    sessions: list[SleepOut]


class ActivitySummary(RangeOut):
    observed_days: int
    total_steps: int | None
    daily: list[ActivityOut]
