from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.core.exceptions import AppError
from app.modules.profiles.schemas import GoalCreate, GoalPatch, ProfilePut, WeightCreate
from app.modules.profiles.service import ProfileService


@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/profile"),
        ("PUT", "/profile"),
        ("PATCH", "/me"),
        ("POST", "/goals"),
        ("GET", "/goals"),
        ("PATCH", f"/goals/{uuid4()}"),
        ("POST", "/weight-logs"),
        ("GET", "/weight-logs"),
    ],
)
def test_protected_endpoints(client, method, path):
    assert client.request(method, "/api/v1" + path).status_code == 401


@pytest.mark.parametrize(
    "values",
    [
        {"weight_kg": -1},
        {"weight_kg": 0},
        {"weight_kg": 70, "recorded_at": "2026-01-01T00:00:00"},
        {"weight_kg": 70, "user_id": str(uuid4())},
    ],
)
def test_invalid_weights(values):
    with pytest.raises(ValidationError):
        WeightCreate(**values)


def test_profile_validation():
    values = dict(
        display_name="Test",
        height_cm=175,
        current_weight_kg=70,
        activity_level="moderate",
        timezone="Asia/Kolkata",
    )
    assert ProfilePut(**values).preferred_weight_unit == "kg"
    with pytest.raises(ValidationError):
        ProfilePut(**{**values, "timezone": "not/a/timezone"})
    with pytest.raises(ValidationError):
        ProfilePut(**{**values, "height_cm": -10})


def test_goal_isolation_and_serialization():
    repository = MagicMock()
    service = ProfileService(repository)
    user_id, goal_id = uuid4(), uuid4()
    repository.goal.return_value = None
    with pytest.raises(AppError) as error:
        service.update_goal(user_id, goal_id, GoalPatch(status="paused"))
    assert error.value.status_code == 404
    repository.goal.assert_called_once_with(user_id, goal_id)
    service.create_goal(
        user_id,
        GoalCreate(
            goal_type="maintenance",
            current_weight_kg=97,
            target_weight_kg=85,
            selected_deficit_kcal=500,
        ),
    )
    repository.pause_active.assert_called_once_with(user_id)


def test_goal_null_and_negative_targets():
    with pytest.raises(ValidationError):
        GoalPatch(status=None)
    with pytest.raises(ValidationError):
        GoalCreate(goal_type="maintenance", protein_target_g=-1)
