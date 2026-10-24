from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import event, func, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.db.models import DailyActivity, User, WaterLog

pytestmark = pytest.mark.integration


def test_concurrent_authenticated_first_login_is_one_user(authenticated_client, pg_engine):
    api, headers = authenticated_client
    own = headers("first-http-login")
    with ThreadPoolExecutor(max_workers=4) as executor:
        responses = list(executor.map(lambda _: api.get("/api/v1/me", headers=own), range(6)))
    assert all(row.status_code == 200 for row in responses)
    assert len({row.json()["id"] for row in responses}) == 1
    with Session(pg_engine) as session:
        assert session.scalar(select(func.count()).select_from(User)) == 1


def test_failed_commit_does_not_report_success_or_persist(authenticated_client, pg_engine):
    api, headers = authenticated_client
    own = headers()
    assert api.get("/api/v1/me", headers=own).status_code == 200

    def fail_commit(session):
        raise OperationalError("private-statement", {}, Exception("private-value"))

    event.listen(Session, "before_commit", fail_commit)
    try:
        response = api.post(
            "/api/v1/water-logs",
            headers=own,
            json={
                "amount_ml": "250.125",
                "consumed_at": "2026-03-08T06:00:00Z",
            },
        )
    finally:
        event.remove(Session, "before_commit", fail_commit)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "DATABASE_UNAVAILABLE"
    assert "private" not in response.text and response.headers["x-request-id"]
    with Session(pg_engine) as session:
        assert session.scalar(select(func.count()).select_from(WaterLog)) == 0


def test_activity_reconciliation_offline_retry_and_isolation(authenticated_client, pg_engine):
    api, headers = authenticated_client
    own, other = headers(), headers("sync-user-b")
    base = {
        "activity_date": "2026-03-08",
        "steps": 5000,
        "distance_m": "3500.125",
        "source": "health_connect",
        "synced_at": "2026-03-09T04:01:00Z",
    }
    first = api.put("/api/v1/activity/daily", headers=own, json=base)
    assert first.status_code == 200
    row_id = first.json()["id"]
    # An offline retry repeats the exact snapshot and generation timestamp.
    assert api.put("/api/v1/activity/daily", headers=own, json=base).json()["id"] == row_id
    assert api.get("/api/v1/activity/daily?date=2026-03-08", headers=other).json() is None
    # Recompute the complete day after deletion; totals may decrease, including to zero.
    deleted = {**base, "steps": 0, "distance_m": "0", "synced_at": "2026-03-09T04:02:00Z"}
    updated = api.put("/api/v1/activity/daily", headers=own, json=deleted)
    assert updated.status_code == 200 and updated.json()["id"] == row_id
    assert updated.json()["activity_date"] == "2026-03-08"
    assert isinstance(updated.json()["distance_m"], str)
    assert Decimal(updated.json()["distance_m"]) == 0
    assert api.put("/api/v1/activity/daily", headers=own, json=base).status_code == 409
    assert (
        api.put("/api/v1/activity/daily", headers=own, json={**deleted, "steps": 1}).json()[
            "error"
        ]["code"]
        == "SYNC_CONFLICT"
    )
    for invalid in (
        {**base, "user_id": row_id},
        {**base, "source": "foreign-app"},
        {**base, "synced_at": "2026-03-09T04:02:00"},
        [base],
        {k: v for k, v in base.items() if k != "steps"},
    ):
        assert api.put("/api/v1/activity/daily", headers=own, json=invalid).status_code == 422
    future = (datetime.now(UTC) + timedelta(hours=1)).isoformat()
    assert (
        api.put(
            "/api/v1/activity/daily", headers=own, json={**base, "synced_at": future}
        ).status_code
        == 422
    )
    with Session(pg_engine) as session:
        assert session.scalar(select(func.count()).select_from(DailyActivity)) == 1
        assert session.scalar(select(DailyActivity.steps)) == 0


def test_sleep_import_mapping_and_nested_workout_parent_isolation(authenticated_client):
    api, headers = authenticated_client
    own, other = headers(), headers("isolation-b")
    sleep = {
        "started_at": "2026-11-01T04:30:00Z",
        "ended_at": "2026-11-01T07:30:00Z",
        "source": "health_connect",
        "external_id": "device-record",
    }
    a = api.post("/api/v1/sleep-sessions", headers=own, json=sleep)
    b = api.post("/api/v1/sleep-sessions", headers=other, json=sleep)
    assert a.status_code == b.status_code == 201 and a.json()["id"] != b.json()["id"]
    path = "/api/v1/sleep-sessions/" + a.json()["id"]
    assert a.json()["duration_seconds"] == 10800
    assert api.patch(path, headers=other, json={"notes": "other"}).status_code == 404
    assert api.delete(path, headers=other).status_code == 404
    assert api.delete(path, headers=own).status_code == 204
    assert api.get(path, headers=own).status_code == 404
    # No server tombstones: replay after deletion creates a new record. Clients must
    # discard acknowledged deleted IDs from pending upload queues.
    replay = api.post("/api/v1/sleep-sessions", headers=own, json=sleep)
    assert replay.status_code == 201 and replay.json()["id"] != a.json()["id"]
    ex = api.post(
        "/api/v1/exercises/custom",
        headers=own,
        json={
            "name": "Private",
            "muscle_group": "legs",
            "equipment": "none",
            "category": "strength",
        },
    ).json()

    def workout(auth):
        return api.post(
            "/api/v1/workout-sessions", headers=auth, json={"started_at": "2026-01-01T00:00:00Z"}
        ).json()["id"]

    first, second, foreign = workout(own), workout(own), workout(other)
    recorded = api.post(
        f"/api/v1/workout-sessions/{first}/sets",
        headers=own,
        json={
            "exercise_id": ex["id"],
            "set_number": 1,
            "reps": 10,
        },
    ).json()["id"]
    for parent, auth in ((second, own), (foreign, other), (first, other)):
        nested = f"/api/v1/workout-sessions/{parent}/sets/{recorded}"
        assert api.patch(nested, headers=auth, json={"reps": 20}).status_code == 404
        assert api.delete(nested, headers=auth).status_code == 404
    assert api.get(f"/api/v1/workout-sessions/{first}", headers=own).json()["sets"][0]["reps"] == 10
