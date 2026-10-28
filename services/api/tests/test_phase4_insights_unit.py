from datetime import UTC, date, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.modules.insights.service import InsightsService, macro_adherence
from app.modules.nutrition.targets import calculate_targets


@pytest.mark.parametrize(
    "consumed,target,remaining,ratio",
    [
        (None, "100", None, None),
        ("0", "100", "100", "0"),
        ("120", "100", "-20", "1.2"),
        ("20", None, None, None),
        ("20", "0", "-20", None),
    ],
)
def test_macro_adherence_preserves_unknown_zero_and_over_target(consumed, target, remaining, ratio):
    def number(value):
        return Decimal(value) if value is not None else None

    result = macro_adherence(number(consumed), number(target))
    assert result == {
        "consumed_g": number(consumed),
        "target_g": number(target),
        "remaining_g": number(remaining),
        "adherence_ratio": number(ratio),
    }


def test_overview_macro_totals_use_snapshots_and_historical_goal_without_day_queries():
    repository = MagicMock()
    repository.timezone.return_value = "America/New_York"
    repository.tracking.return_value = {"water": [], "sleep": [], "activity": [], "weight": []}
    repository.targets.return_value = []
    repository.workouts.return_value = ([], [])
    repository.workout_count.return_value = 0
    meal_id, goal_id = uuid4(), uuid4()
    goal = SimpleNamespace(
        id=goal_id,
        daily_calorie_target=Decimal("1800"),
        protein_target_g=Decimal("150"),
        carbs_target_g=Decimal("180"),
        fat_target_g=Decimal("60"),
        fiber_target_g=Decimal("25.2"),
    )
    repository.nutrition.return_value = (
        [SimpleNamespace(id=meal_id, consumed_at=datetime(2026, 3, 8, 5, tzinfo=UTC))],
        [
            SimpleNamespace(
                meal_log_id=meal_id,
                calories_kcal_snapshot=Decimal("100"),
                protein_g_snapshot=Decimal("0"),
                carbs_g_snapshot=Decimal("20"),
                fat_g_snapshot=None,
                fiber_g_snapshot=Decimal("2"),
            )
        ],
        [SimpleNamespace(goal_id=goal_id, effective_at=datetime(2026, 3, 7, tzinfo=UTC))],
        {goal_id: goal},
    )
    result = InsightsService(repository).overview(uuid4(), date(2026, 3, 8), date(2026, 3, 9))
    observed, missing = [day["nutrition"] for day in result["daily"]]
    assert observed["protein"]["adherence_ratio"] == 0
    assert observed["fat"]["consumed_g"] is None
    assert observed["fiber"]["remaining_g"] == Decimal("23.2")
    assert missing["has_logs"] is False
    assert missing["protein"] == {
        "target_g": Decimal("150"),
        "consumed_g": None,
        "remaining_g": None,
        "adherence_ratio": None,
    }
    repository.nutrition.assert_called_once()
    assert repository.nutrition.call_args.args[1:] == (
        datetime(2026, 3, 8, 5, tzinfo=UTC),
        datetime(2026, 3, 10, 4, tzinfo=UTC),
    )


def test_dashboard_goal_is_historical_and_does_not_invent_weight(monkeypatch):
    repository = MagicMock()
    repository.timezone.return_value = "UTC"
    repository.latest_weight.return_value = None
    historical = SimpleNamespace(
        id=uuid4(),
        **calculate_targets(Decimal("97"), Decimal("85"), Decimal("500"), Decimal("1500")),
    )
    nutrition = MagicMock()
    nutrition.profile.return_value = None
    nutrition.meals.return_value = []
    # A second resolution could observe a concurrently activated goal. The
    # unified response must use exactly one goal for its context and budgets.
    nutrition.goal_at.side_effect = [historical, SimpleNamespace(id=uuid4())]
    monkeypatch.setattr(
        "app.modules.insights.service.NutritionRepository", lambda session: nutrition
    )
    service = InsightsService(repository)
    service.overview = MagicMock(
        return_value={"daily": [{"water": {}, "activity": None, "sleep": {}}], "workouts": {}}
    )
    result = service.dashboard(uuid4(), date(2026, 1, 1))
    assert result["goal"] is historical
    assert result["nutrition"]["daily_calorie_target"] == historical.daily_calorie_target
    assert result["weight"] is None
    nutrition.goal_at.assert_called_once()
    assert nutrition.goal_at.call_args.args[1] == datetime(2026, 1, 2, tzinfo=UTC)
