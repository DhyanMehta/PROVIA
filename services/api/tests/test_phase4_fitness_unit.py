from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.core.exceptions import AppError
from app.modules.workouts.schemas import CompleteInput, SessionCreate
from app.modules.workouts.service import WorkoutService


@pytest.mark.parametrize("operation", ["patch", "delete"])
def test_missing_nested_set_is_hidden_before_completed_parent_state(operation):
    repository = SimpleNamespace(
        owned=lambda *args, **kwargs: SimpleNamespace(status="completed", sets=[]),
        lock_user=lambda user_id: None,
    )
    service = WorkoutService(repository)
    with pytest.raises(AppError) as caught:
        if operation == "patch":
            service.set(uuid4(), uuid4(), SimpleNamespace(), uuid4())
        else:
            service.delete_set(uuid4(), uuid4(), uuid4())
    assert caught.value.status_code == 404


@pytest.mark.parametrize("end", ["2026-01-01T12:00:00Z", "2026-01-01T11:59:59Z"])
def test_completion_requires_positive_elapsed_duration(end):
    row = SimpleNamespace(
        started_at=datetime(2026, 1, 1, 12, tzinfo=UTC), status="in_progress", sets=[]
    )
    repository = SimpleNamespace(owned=lambda *args, **kwargs: row)
    with pytest.raises(AppError) as error:
        WorkoutService(repository).complete(uuid4(), uuid4(), CompleteInput(completed_at=end))
    assert error.value.code == "INVALID_INTERVAL"
    assert row.status == "in_progress"


def test_duration_only_workout_remains_valid():
    row = SimpleNamespace(
        started_at=datetime(2026, 1, 1, 12, tzinfo=UTC), status="in_progress", sets=[]
    )
    repository = SimpleNamespace(owned=lambda *args, **kwargs: row, save=lambda value: value)
    result = WorkoutService(repository).complete(
        uuid4(), uuid4(), CompleteInput(completed_at="2026-01-01T12:01:00Z")
    )
    assert result.status == "completed"


def test_start_checks_active_workout_after_user_lock():
    calls = []
    repository = SimpleNamespace(
        lock_user=lambda user_id: calls.append("locked"),
        active_session=lambda user_id: calls.append("checked") or object(),
    )
    with pytest.raises(AppError) as error:
        WorkoutService(repository).start(uuid4(), SessionCreate(started_at="2026-01-01T12:00:00Z"))
    assert error.value.code == "ACTIVE_WORKOUT_EXISTS"
    assert calls == ["locked", "checked"]
