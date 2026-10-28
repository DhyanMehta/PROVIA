from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.modules.profiles.schemas import (
    GoalPatch,
    WeightCreate,
    WeightGoalConfirmation,
    WeightPatch,
)
from app.modules.profiles.service import ProfileService


@pytest.mark.parametrize(
    "verified,profile_exists,goal_exists,step",
    [
        (False, False, False, "verify_email"),
        (False, True, True, "verify_email"),
        (True, False, False, "profile"),
        (True, False, True, "profile"),
        (True, True, False, "goal"),
        (True, True, True, "dashboard"),
    ],
)
def test_onboarding_state_is_derived(verified, profile_exists, goal_exists, step):
    repository = MagicMock()
    repository.profile.return_value = object() if profile_exists else None
    repository.active_goal.return_value = object() if goal_exists else None
    principal = SimpleNamespace(
        user=SimpleNamespace(id=uuid4()),
        account=SimpleNamespace(
            email_verified_at=datetime.now(UTC) if verified else None,
            status="active" if verified else "pending_verification",
        ),
    )
    state = ProfileService(repository).onboarding(principal)
    assert state["next_step"] == step
    assert state["onboarding_complete"] == (step == "dashboard")
    assert state["profile_exists"] == profile_exists
    assert state["active_goal_exists"] == goal_exists
    repository.active_goal.assert_called_once_with(principal.user.id)


@pytest.mark.parametrize(
    "values",
    [
        {"source": "health_connect"},
        {"external_id": "manual-cannot-claim-a-source-id"},
        {"source": "health_connect", "external_id": " "},
        {"source": "unknown"},
    ],
)
def test_weight_source_identity_validation(values):
    with pytest.raises(ValidationError):
        WeightCreate(weight_kg="70", **values)


@pytest.mark.parametrize(
    "values",
    [
        {},
        {"weight_kg": None},
        {"recorded_at": None},
        {"weight_kg": 0},
        {"recorded_at": "2026-01-01T00:00:00"},
        {"recorded_at": datetime.now(UTC) + timedelta(days=1)},
        {"source": "manual"},
        {"external_id": "replacement"},
    ],
)
def test_weight_correction_rejects_invalid_or_identity_changes(values):
    with pytest.raises(ValidationError):
        WeightPatch(**values)


def test_steps_only_goal_revision_preserves_previous_snapshot():
    repository = MagicMock()
    previous = SimpleNamespace(
        id=uuid4(),
        current_weight_kg_snapshot=Decimal("97"),
        target_weight_kg=Decimal("85"),
        selected_deficit_kcal=Decimal("500"),
        goal_type="weight_loss",
        status="active",
        daily_steps_target=5000,
    )
    repository.goal.return_value = previous
    repository.save.side_effect = lambda row: row
    result = ProfileService(repository).update_goal(
        uuid4(), previous.id, GoalPatch(daily_steps_target=7000)
    )
    assert result is not previous
    assert result.daily_steps_target == 7000
    assert previous.daily_steps_target == 5000
    assert result.current_weight_kg_snapshot == previous.current_weight_kg_snapshot
    assert result.daily_calorie_target == Decimal("1828")
    repository.record_transition.assert_called_once()


def test_weight_correction_does_not_recalculate_profile_or_goal():
    repository = MagicMock()
    row = SimpleNamespace(weight_kg=Decimal("70"), source="manual", external_id=None)
    repository.weight.return_value = row
    repository.save.side_effect = lambda value: value
    result = ProfileService(repository).patch_weight(uuid4(), uuid4(), WeightPatch(weight_kg="71"))
    assert result.weight_kg == Decimal("71")
    repository.put_profile.assert_not_called()
    repository.pause_active.assert_not_called()


def test_import_replay_requires_same_measurement():
    from app.core.exceptions import AppError

    data = WeightCreate(
        weight_kg="70",
        recorded_at="2026-01-01T00:00:00Z",
        source="health_connect",
        external_id="provider-record",
    )
    repository = MagicMock()
    existing = SimpleNamespace(weight_kg=data.weight_kg, recorded_at=data.recorded_at)
    repository.external_weight.return_value = existing
    service = ProfileService(repository)
    assert service.add_weight(uuid4(), data) is existing
    existing.weight_kg = Decimal("71")
    with pytest.raises(AppError) as error:
        service.add_weight(uuid4(), data)
    assert error.value.status_code == 409
    repository.save.assert_not_called()


def test_weight_goal_confirmation_requires_previewed_value():
    with pytest.raises(ValidationError):
        WeightGoalConfirmation(expected_goal_id=uuid4())


def test_stale_weight_confirmation_locks_and_rejects_before_calculation():
    from app.core.exceptions import AppError

    repository = MagicMock()
    repository.weight.return_value = SimpleNamespace(weight_kg=Decimal("95"))
    user_id, weight_id, goal_id = uuid4(), uuid4(), uuid4()
    with pytest.raises(AppError) as error:
        ProfileService(repository).apply_weight(user_id, weight_id, goal_id, Decimal("96"))
    assert error.value.status_code == 409 and error.value.code == "WEIGHT_CHANGED"
    assert repository.method_calls[:2] == [
        ("lock_user", (user_id,), {}),
        ("weight", (user_id, weight_id), {"lock": True}),
    ]
    repository.active_goal.assert_not_called()
    repository.save.assert_not_called()
