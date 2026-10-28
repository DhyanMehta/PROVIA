"""Real PostgreSQL coverage for Phase 4 tracking and workout completion gaps."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import User, WorkoutSession

pytestmark = pytest.mark.integration
PREFIX = "/api/v1"
RANGE = "start_date=2026-01-01&end_date=2026-01-03"


def call(api, auth, method, path, body=None, expected=200):
    response = api.request(method, PREFIX + path, headers=auth, json=body)
    assert response.status_code == expected, response.text
    return response.json() if expected != 204 else None


def test_active_workout_retries_lifecycle_and_isolation(authenticated_client):
    api, headers = authenticated_client
    own, other = headers(), headers("user-b")
    keyed = {**own, "Idempotency-Key": str(uuid4())}
    body = {"started_at": "2026-01-01T12:00:00Z"}
    assert call(api, own, "GET", "/workout-sessions/active") is None
    first = call(api, keyed, "POST", "/workout-sessions", body, 201)
    assert call(api, keyed, "POST", "/workout-sessions", body, 201)["id"] == first["id"]
    conflict = call(api, own, "POST", "/workout-sessions", body, 409)
    assert conflict["error"]["code"] == "ACTIVE_WORKOUT_EXISTS"
    assert call(api, own, "GET", "/workout-sessions/active")["id"] == first["id"]
    assert call(api, other, "GET", "/workout-sessions/active") is None
    active = call(api, own, "GET", f"/workout-sessions?status=in_progress&{RANGE}")
    assert [row["id"] for row in active["items"]] == [first["id"]]
    path = f"/workout-sessions/{first['id']}"
    call(api, own, "POST", path + "/complete", {"completed_at": body["started_at"]}, 422)
    completed = call(api, own, "POST", path + "/complete", {"completed_at": "2026-01-01T12:30:00Z"})
    assert completed["status"] == "completed" and completed["sets"] == []
    assert call(api, own, "GET", "/workout-sessions/active") is None
    # A retry acknowledges the original resource even after its lifecycle advances.
    assert call(api, keyed, "POST", "/workout-sessions", body, 201)["status"] == "completed"
    next_session = call(api, own, "POST", "/workout-sessions", body, 201)
    call(api, own, "PATCH", f"/workout-sessions/{next_session['id']}", {"status": "cancelled"})
    assert call(api, own, "GET", "/workout-sessions/active") is None
    call(api, own, "GET", "/workout-sessions?status=invalid", expected=422)


def test_concurrent_workout_start_creates_one_active_row(authenticated_client):
    api, headers = authenticated_client
    own = headers()

    def start(_):
        return api.post(
            PREFIX + "/workout-sessions",
            headers=own,
            json={"started_at": "2026-01-01T12:00:00Z"},
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(start, range(2)))
    assert sorted(response.status_code for response in responses) == [201, 409]
    assert next(row for row in responses if row.status_code == 409).json()["error"]["code"] == (
        "ACTIVE_WORKOUT_EXISTS"
    )
    assert len(call(api, own, "GET", f"/workout-sessions?{RANGE}")["items"]) == 1


def test_legacy_active_rows_remain_accessible_without_rewriting(authenticated_client, pg_engine):
    api, headers = authenticated_client
    own = headers()
    with Session(pg_engine) as db:
        user_id = db.scalar(select(User.id).where(User.auth_provider_subject == "user-a"))
        rows = [
            WorkoutSession(
                user_id=user_id,
                started_at=datetime(2026, 1, day, 12, tzinfo=UTC),
                status="in_progress",
            )
            for day in (1, 2)
        ]
        db.add_all(rows)
        db.flush()
        old_id, latest_id = [str(row.id) for row in rows]
        db.commit()
    assert call(api, own, "GET", "/workout-sessions/active")["id"] == latest_id
    assert len(call(api, own, "GET", f"/workout-sessions?status=in_progress&{RANGE}")["items"]) == 2
    call(api, own, "POST", "/workout-sessions", {"started_at": "2026-01-03T12:00:00Z"}, 409)
    call(api, own, "PATCH", f"/workout-sessions/{latest_id}", {"status": "cancelled"})
    assert call(api, own, "GET", "/workout-sessions/active")["id"] == old_id


def test_water_retry_conflict_deleted_replay_and_key_isolation(authenticated_client):
    api, headers = authenticated_client
    own, other = headers(), headers("user-b")
    key = {"Idempotency-Key": str(uuid4())}
    payload = {"amount_ml": "250.125", "consumed_at": "2026-01-01T12:00:00Z"}
    first = call(api, {**own, **key}, "POST", "/water-logs", payload, 201)
    assert call(api, {**own, **key}, "POST", "/water-logs", payload, 201)["id"] == first["id"]
    call(api, {**own, **key}, "POST", "/water-logs", {**payload, "amount_ml": "300"}, 409)
    foreign = call(api, {**other, **key}, "POST", "/water-logs", payload, 201)
    assert foreign["id"] != first["id"]
    call(api, own, "DELETE", f"/water-logs/{first['id']}", expected=204)
    deleted = call(api, {**own, **key}, "POST", "/water-logs", payload, 409)
    assert deleted["error"]["code"] == "IDEMPOTENCY_RESOURCE_DELETED"
    assert call(api, own, "GET", f"/water-logs?{RANGE}")["items"] == []
    call(api, {**own, "Idempotency-Key": "not-a-uuid"}, "POST", "/water-logs", payload, 422)


def test_manual_sleep_retry_preserves_one_overnight_record(authenticated_client):
    api, headers = authenticated_client
    own = headers()
    keyed = {**own, "Idempotency-Key": str(uuid4())}
    payload = {"started_at": "2026-01-01T23:00:00+05:30", "ended_at": "2026-01-02T07:00:00+05:30"}
    first = call(api, keyed, "POST", "/sleep-sessions", payload, 201)
    assert first["duration_seconds"] == 28800
    assert call(api, keyed, "POST", "/sleep-sessions", payload, 201)["id"] == first["id"]
    call(api, keyed, "POST", "/sleep-sessions", {**payload, "notes": "changed"}, 409)
    call(api, own, "DELETE", f"/sleep-sessions/{first['id']}", expected=204)
    assert call(api, keyed, "POST", "/sleep-sessions", payload, 409)["error"]["code"] == (
        "IDEMPOTENCY_RESOURCE_DELETED"
    )


def test_activity_history_pagination_delete_and_unknown_values(authenticated_client):
    api, headers = authenticated_client
    own, other = headers(), headers("user-b")
    for day, steps in (("2026-01-01", 0), ("2026-01-03", 1200)):
        call(api, own, "PUT", "/activity/daily", {"activity_date": day, "steps": steps})
    first = call(api, own, "GET", f"/activity?{RANGE}&limit=1")
    assert first["items"][0]["steps"] == 0
    assert first["items"][0]["distance_m"] is None
    second = call(api, own, "GET", f"/activity?{RANGE}&limit=1&offset=1")
    assert second["items"][0]["activity_date"] == "2026-01-03"
    assert call(api, other, "GET", f"/activity?{RANGE}")["items"] == []
    call(api, other, "DELETE", "/activity/daily?date=2026-01-01", expected=204)
    assert call(api, own, "GET", "/activity/daily?date=2026-01-01")["steps"] == 0
    call(api, own, "DELETE", "/activity/daily?date=2026-01-01", expected=204)
    call(api, own, "DELETE", "/activity/daily?date=2026-01-01", expected=204)
    assert call(api, own, "GET", "/activity/daily?date=2026-01-01") is None
    assert len(call(api, own, "GET", f"/activity?{RANGE}")["items"]) == 1
    call(api, own, "GET", "/activity?start_date=2026-02-01&end_date=2026-01-01", expected=422)
