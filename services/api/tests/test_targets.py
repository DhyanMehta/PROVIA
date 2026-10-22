from datetime import date
from decimal import Decimal as D
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.core.exceptions import AppError
from app.modules.nutrition.calculations import macro_budget
from app.modules.nutrition.service import NutritionService
from app.modules.nutrition.targets import calculate_targets
from app.modules.profiles.schemas import GoalCreate, GoalPatch
from app.modules.profiles.service import ProfileService


def test_exact_reference_calculation():
    result = calculate_targets(D(97), D(85), D(500), D(1500))
    expected = {
        "maintenance_calories": "2328",
        "daily_calorie_target": "1828",
        "protein_target_g": "161.5",
        "protein_target_kcal": "646",
        "fat_target_g": "67.9",
        "fat_target_kcal": "611.1",
        "fiber_target_g": "25.592",
        "carbs_target_g": "142.725",
        "carbs_target_kcal": "570.9",
    }
    for key, value in expected.items():
        assert result[key] == D(value)
    assert result["calculation_method"] == "weight_x_24"
    assert result["calculation_version"] == "1"


@pytest.mark.parametrize(
    "current,target,deficit,code",
    [
        (0, 85, 500, "INVALID_WEIGHT"),
        (-1, 85, 500, "INVALID_WEIGHT"),
        (97, 0, 500, "INVALID_TARGET_WEIGHT"),
        (97, -1, 500, "INVALID_TARGET_WEIGHT"),
        (97, 85, -1, "INVALID_DEFICIT"),
        (97, 85, 2328, "DEFICIT_TOO_HIGH"),
        (97, 85, 2400, "DEFICIT_TOO_HIGH"),
        (97, 85, 1000, "CALORIE_SAFEGUARD"),
        (97, 300, 0, "NONPOSITIVE_CARB_BUDGET"),
    ],
)
def test_calculation_rejections(current, target, deficit, code):
    with pytest.raises(AppError) as error:
        calculate_targets(D(current), D(target), D(deficit), D(1500))
    assert error.value.code == code
    assert error.value.status_code == 422


def test_reference_preview_endpoints(client):
    response = client.post(
        "/api/v1/nutrition/calculate-maintenance", json={"current_weight_kg": 97}
    )
    assert response.status_code == 200
    assert D(response.json()["maintenance_calories"]) == 2328
    assert response.json()["is_estimate"] is True
    response = client.post(
        "/api/v1/nutrition/calculate-goals",
        json={"current_weight_kg": 97, "target_weight_kg": 85, "deficit_kcal": 500},
    )
    assert response.status_code == 200
    assert D(response.json()["carbs_target_g"]) == D("142.725")
    assert (
        client.post(
            "/api/v1/nutrition/calculate-goals",
            json={"current_weight_kg": 97, "target_weight_kg": 85, "deficit_kcal": 1000},
        ).json()["error"]["code"]
        == "CALORIE_SAFEGUARD"
    )


def test_no_intermediate_rounding():
    result = calculate_targets(D("97.123"), D("85.456"), D("500.123"), D(1500))
    assert result["protein_target_g"] == D("162.3664")
    assert result["fat_target_g"] == D("67.9861")
    assert result["carbs_target_g"] == (D("1830.829") - D("162.3664") * 4 - D("67.9861") * 9) / 4


def test_remaining_budget_no_double_subtraction():
    goal = SimpleNamespace(**calculate_targets(D(97), D(85), D(500), D(1500)))
    repository = MagicMock()
    service = NutritionService(repository)
    service.day_data = MagicMock(
        return_value=(
            {
                "timezone": "UTC",
                "meals": [],
                "targets": {
                    "calories_kcal": D(1828),
                    "protein_g": D("161.5"),
                    "carbs_g": D("142.725"),
                    "fat_g": D("67.9"),
                    "fiber_g": D("25.592"),
                },
                "totals": {
                    "calories_kcal": D(300),
                    "protein_g": D(25),
                    "carbs_g": D(20),
                    "fat_g": D(10),
                    "fiber_g": D(5),
                },
            },
            goal,
        )
    )
    dashboard = service.dashboard(uuid4(), date(2026, 1, 1))
    assert dashboard["calories"]["remaining"] == 1528
    assert dashboard["protein"]["remaining_g"] == D("136.5")
    assert dashboard["protein"]["remaining_kcal"] == 546
    assert dashboard["carbs"]["remaining_g"] == D("122.725")
    assert dashboard["fat"]["remaining_g"] == D("57.9")
    assert dashboard["fiber"]["remaining_g"] == D("20.592")
    assert macro_budget(D(10), D(20), 4)["remaining_g"] == -10
    assert macro_budget(D(10), None, 4)["remaining_kcal"] is None


def test_dashboard_no_goals_or_meals():
    repository = MagicMock()
    repository.profile.return_value = None
    repository.active_goal.return_value = None
    repository.meals.return_value = []
    dashboard = NutritionService(repository).dashboard(uuid4(), date(2026, 1, 1))
    assert dashboard["calories"] == {"target": None, "consumed": D(0), "remaining": None}


def test_preview_and_persistence_share_calculation():
    repo = MagicMock()
    repo.save.side_effect = lambda entity: entity
    service = ProfileService(repo)
    data = GoalCreate(current_weight_kg=97, target_weight_kg=85, selected_deficit_kcal=500)
    goal = service.create_goal(uuid4(), data)
    assert goal.daily_calorie_target == 1828
    assert goal.carbs_target_g == D("142.725")
    goal.id = uuid4()
    repo.goal.return_value = goal
    revised = service.update_goal(goal.user_id, goal.id, GoalPatch(selected_deficit_kcal=400))
    assert revised is not goal
    assert goal.selected_deficit_kcal == 500
    assert revised.daily_calorie_target == 1928


def test_dashboard_requires_auth(client):
    assert client.get("/api/v1/nutrition/dashboard?date=2026-01-01").status_code == 401


def test_legacy_goal_cannot_bypass_calorie_safeguard():
    repo = MagicMock()
    repo.goal.return_value = SimpleNamespace(calculation_method=None)
    with pytest.raises(AppError) as error:
        ProfileService(repo).update_goal(uuid4(), uuid4(), GoalPatch(status="active"))
    assert error.value.code == "CALCULATION_INPUTS_REQUIRED"
