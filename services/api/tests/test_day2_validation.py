from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.core.exceptions import AppError
from app.modules.insights.service import volume
from app.modules.tracking.schemas import ActivityPut, SleepCreate, WaterCreate, WaterPatch
from app.modules.tracking.service import date_range
from app.modules.workouts.schemas import DayInput, ExercisePatch, PlanCreate, SetCreate, SetPatch


@pytest.mark.parametrize(
    "change", [{"kind": "warmup"}, {"is_completed": False}, {"is_skipped": True}]
)
def test_volume_excludes_nonqualifying_sets(change):
    row = dict(
        weight_kg=Decimal("25.125"), reps=8, kind="working", is_completed=True, is_skipped=False
    )
    assert volume([SimpleNamespace(**row)]) == Decimal(201)
    assert volume([SimpleNamespace(**(row | change))]) == 0


@pytest.mark.parametrize(
    "change",
    [
        {"weight_kg": -1},
        {"reps": -1},
        {"duration_seconds": -1},
        {"rest_seconds": -1},
        {"set_number": 0},
        {"kind": "invalid"},
        {"is_completed": True},
        {"is_completed": True, "is_skipped": True, "reps": 10},
    ],
)
def test_invalid_set_inputs(change):
    with pytest.raises(ValidationError):
        SetCreate.model_validate({"exercise_id": uuid4(), "set_number": 1, **change})


def test_duration_only_completed_set():
    data = SetCreate(exercise_id=uuid4(), set_number=1, is_completed=True, duration_seconds=600)
    assert data.reps == 0 and data.weight_kg == 0


@pytest.mark.parametrize(
    "model,values",
    [
        (WaterPatch, {"amount_ml": None}),
        (SetPatch, {"reps": None}),
        (ExercisePatch, {"name": None}),
    ],
)
def test_patch_rejects_null_required_fields(model, values):
    with pytest.raises(ValidationError):
        model.model_validate(values)


@pytest.mark.parametrize("amount", [0, -1, 10001, "NaN", "Infinity", "0.0001"])
def test_invalid_water_quantities(amount):
    with pytest.raises(ValidationError):
        WaterCreate(amount_ml=amount, consumed_at="2026-01-01T00:00:00Z")


@pytest.mark.parametrize(
    "end", ["2026-01-01T21:00:00Z", "2026-01-01T22:00:00Z", "2026-01-02T22:00:01Z"]
)
def test_invalid_sleep_duration(end):
    with pytest.raises(ValidationError):
        SleepCreate(started_at="2026-01-01T22:00:00Z", ended_at=end)


def test_sleep_offsets_are_normalized_and_stage_boundaries_checked():
    data = SleepCreate(started_at="2026-01-01T23:00:00+05:30", ended_at="2026-01-02T07:00:00+05:30")
    assert (data.ended_at - data.started_at).total_seconds() == 28800
    with pytest.raises(ValidationError):
        SleepCreate(
            **data.model_dump(exclude={"stages"}),
            stages=[
                {
                    "stage": "deep",
                    "started_at": "2026-01-01T00:00:00Z",
                    "ended_at": "2026-01-01T23:00:00Z",
                }
            ],
        )
    with pytest.raises(ValidationError):
        SleepCreate(
            **data.model_dump(exclude={"stages"}),
            stages=[
                {
                    "stage": "deep",
                    "started_at": "2026-01-01T20:00:00Z",
                    "ended_at": "2026-01-01T22:00:00Z",
                },
                {
                    "stage": "rem",
                    "started_at": "2026-01-01T21:00:00Z",
                    "ended_at": "2026-01-01T23:00:00Z",
                },
            ],
        )


def test_health_connect_requires_sync_identifiers():
    with pytest.raises(ValidationError):
        ActivityPut(activity_date="2026-01-01", steps=10, source="health_connect")
    with pytest.raises(ValidationError):
        SleepCreate(
            started_at="2026-01-01T22:00:00Z",
            ended_at="2026-01-02T06:00:00Z",
            source="health_connect",
        )


def test_plan_schedule_validation():
    ex = {"exercise_id": uuid4(), "order_index": 0, "target_sets": 3, "target_reps": 8}
    with pytest.raises(ValidationError):
        DayInput(day_of_week=0, name="Rest", is_rest=True, exercises=[ex])
    with pytest.raises(ValidationError):
        DayInput(day_of_week=0, name="Pull", exercises=[ex, ex])
    with pytest.raises(ValidationError):
        PlanCreate(
            name="Weekly", days=[{"day_of_week": 0, "name": "A"}, {"day_of_week": 0, "name": "B"}]
        )


@pytest.mark.parametrize(
    "start,end",
    [
        (date(2026, 2, 1), date(2026, 1, 1)),
        (date(2020, 1, 1), date(2026, 1, 1)),
        (date(1, 1, 1), date(1, 1, 2)),
    ],
)
def test_invalid_analytics_ranges(start, end):
    with pytest.raises(AppError):
        date_range(start, end, "UTC")


def test_range_uses_dst_midnight_boundaries():
    _, _, start, end = date_range(date(2026, 3, 8), date(2026, 3, 8), "America/New_York")
    assert (end - start).total_seconds() == 23 * 3600


def test_default_start_does_not_underflow_invalid_end():
    with pytest.raises(AppError):
        date_range(None, date(1, 1, 1), "UTC")
