from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from alembic import command
from app.db.auth_models import AuthAccount
from app.db.base import Base
from app.db.models import FitnessGoal, RequestReceipt, User, WeightLog

pytestmark = pytest.mark.integration
PREFIX = "/api/v1"
PROFILE = {
    "display_name": "Test",
    "height_cm": "175",
    "current_weight_kg": "97",
    "activity_level": "moderate",
    "timezone": "America/New_York",
}
GOAL = {"target_weight_kg": "85", "selected_deficit_kcal": "500", "daily_steps_target": 5000}


def test_onboarding_sequence_and_goal_revision(authenticated_client, pg_engine):
    api, headers = authenticated_client
    own, other = headers(), headers("other")
    assert api.get(PREFIX + "/onboarding").status_code == 401
    assert api.get(PREFIX + "/onboarding", headers=own).json()["next_step"] == "profile"
    with Session(pg_engine) as db, db.begin():
        account = db.scalar(select(AuthAccount).where(AuthAccount.email == "user-a@example.com"))
        account.status, account.email_verified_at = "pending_verification", None
    response = api.get(PREFIX + "/onboarding", headers=own)
    assert response.status_code == 200
    assert response.json()["next_step"] == "verify_email"
    assert response.json()["email_verified"] is False
    with Session(pg_engine) as db, db.begin():
        account = db.scalar(select(AuthAccount).where(AuthAccount.email == "user-a@example.com"))
        account.status, account.email_verified_at = "active", datetime.now(UTC)
    assert api.put(PREFIX + "/profile", headers=own, json=PROFILE).status_code == 200
    state = api.get(PREFIX + "/onboarding", headers=own).json()
    assert state["profile_exists"] and not state["onboarding_complete"]
    assert state["next_step"] == "goal"
    goal_headers = {**own, "Idempotency-Key": str(uuid4())}
    goal = api.post(PREFIX + "/goals", headers=goal_headers, json=GOAL)
    assert goal.status_code == 201
    old_id = goal.json()["id"]
    assert api.post(PREFIX + "/goals", headers=goal_headers, json=GOAL).json()["id"] == old_id
    revised = api.patch(PREFIX + "/goals/" + old_id, headers=own, json={"daily_steps_target": 7000})
    assert revised.status_code == 200
    assert revised.json()["id"] != old_id
    state = api.get(PREFIX + "/onboarding", headers=own).json()
    assert state["onboarding_complete"] and state["next_step"] == "dashboard"
    assert state["active_goal"]["id"] == revised.json()["id"]
    assert state["profile"]["timezone"] == "America/New_York"
    other_state = api.get(PREFIX + "/onboarding", headers=other).json()
    assert other_state["profile"] is None and other_state["active_goal"] is None
    with Session(pg_engine) as db:
        assert db.get(FitnessGoal, UUID(old_id)).daily_steps_target == 5000
    weight = api.post(
        PREFIX + "/weight-logs",
        headers=own,
        json={"weight_kg": "96", "recorded_at": "2026-01-01T00:00:00Z"},
    ).json()
    apply_path = PREFIX + "/weight-logs/" + weight["id"] + "/apply-goal"
    apply_headers = {**own, "Idempotency-Key": str(uuid4())}
    apply_payload = {"expected_goal_id": revised.json()["id"], "expected_weight_kg": "96"}
    applied = api.post(apply_path, headers=apply_headers, json=apply_payload)
    assert applied.status_code == 201
    replay = api.post(apply_path, headers=apply_headers, json=apply_payload)
    assert replay.status_code == 201 and replay.json()["id"] == applied.json()["id"]
    other_path = PREFIX + "/weight-logs/" + str(uuid4()) + "/apply-goal"
    assert api.post(other_path, headers=apply_headers, json=apply_payload).status_code == 409


def test_weight_crud_retry_isolation_and_local_dst_filter(authenticated_client, pg_engine):
    api, headers = authenticated_client
    own, other = headers(), headers("other")
    assert api.put(PREFIX + "/profile", headers=own, json=PROFILE).status_code == 200
    assert api.get(PREFIX + "/weight-logs/latest", headers=own).status_code == 404
    payload = {"weight_kg": "97.125", "recorded_at": "2026-03-08T05:00:00Z"}
    retry_headers = {**own, "Idempotency-Key": str(uuid4())}
    first = api.post(PREFIX + "/weight-logs", headers=retry_headers, json=payload)
    assert first.status_code == 201
    weight_id = first.json()["id"]
    assert first.json()["source"] == "manual" and first.json()["external_id"] is None
    replay = api.post(PREFIX + "/weight-logs", headers=retry_headers, json=payload)
    assert replay.status_code == 201 and replay.json()["id"] == weight_id
    assert (
        api.post(
            PREFIX + "/weight-logs",
            headers=retry_headers,
            json={**payload, "weight_kg": "96"},
        ).status_code
        == 409
    )
    for method in ("GET", "PATCH", "DELETE"):
        response = api.request(
            method,
            PREFIX + "/weight-logs/" + weight_id,
            headers=other,
            json={"weight_kg": "99"} if method == "PATCH" else None,
        )
        assert response.status_code == 404
    end_boundary = api.post(
        PREFIX + "/weight-logs",
        headers=own,
        json={"weight_kg": "96", "recorded_at": "2026-03-09T04:00:00Z"},
    )
    assert end_boundary.status_code == 201
    rows = api.get(
        PREFIX + "/weight-logs?start_date=2026-03-08&end_date=2026-03-08", headers=own
    ).json()["items"]
    assert [row["id"] for row in rows] == [weight_id]
    assert (
        api.get(PREFIX + "/weight-logs/latest", headers=own).json()["id"]
        == end_boundary.json()["id"]
    )
    patched = api.patch(
        PREFIX + "/weight-logs/" + weight_id, headers=own, json={"weight_kg": "96.5"}
    )
    assert patched.status_code == 200 and isinstance(patched.json()["weight_kg"], str)
    assert Decimal(patched.json()["weight_kg"]) == Decimal("96.5")
    assert Decimal(
        api.get(PREFIX + "/profile", headers=own).json()["current_weight_kg"]
    ) == Decimal("97")
    assert api.delete(PREFIX + "/weight-logs/" + weight_id, headers=own).status_code == 204
    assert api.post(PREFIX + "/weight-logs", headers=retry_headers, json=payload).status_code == 409
    with Session(pg_engine) as db:
        assert db.get(WeightLog, UUID(weight_id)) is None
        assert db.scalar(select(RequestReceipt)).resource_id == UUID(weight_id)


def test_weight_import_replay_concurrency_and_source_immutability(authenticated_client):
    api, headers = authenticated_client
    own = headers()
    payload = {
        "weight_kg": "70.123",
        "recorded_at": "2026-01-01T12:00:00Z",
        "source": "health_connect",
        "external_id": "source-record-1",
    }
    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(
            executor.map(
                lambda _: api.post(PREFIX + "/weight-logs", headers=own, json=payload), range(2)
            )
        )
    assert all(row.status_code == 201 for row in responses)
    row_id = responses[0].json()["id"]
    assert {row.json()["id"] for row in responses} == {row_id}
    assert (
        api.post(
            PREFIX + "/weight-logs", headers=own, json={**payload, "weight_kg": "71"}
        ).status_code
        == 409
    )
    assert (
        api.patch(
            PREFIX + "/weight-logs/" + row_id, headers=own, json={"source": "manual"}
        ).status_code
        == 422
    )
    assert (
        api.patch(
            PREFIX + "/weight-logs/" + row_id, headers=own, json={"weight_kg": "71"}
        ).status_code
        == 200
    )
    assert (
        api.get(PREFIX + "/weight-logs/" + row_id, headers=own).json()["source"] == "health_connect"
    )


def test_weight_goal_confirmation_rejects_changed_measurement(authenticated_client):
    api, headers = authenticated_client
    own = headers()
    assert api.put(PREFIX + "/profile", headers=own, json=PROFILE).status_code == 200
    goal = api.post(PREFIX + "/goals", headers=own, json=GOAL).json()
    measurement = api.post(PREFIX + "/weight-logs", headers=own, json={"weight_kg": "96"}).json()
    path = PREFIX + "/weight-logs/" + measurement["id"]
    preview = api.post(path + "/goal-preview", headers=own).json()
    confirmation = {
        "expected_goal_id": preview["base_goal_id"],
        "expected_weight_kg": preview["current_weight_kg_snapshot"],
    }
    assert api.patch(path, headers=own, json={"weight_kg": "95"}).status_code == 200
    stale = api.post(path + "/apply-goal", headers=own, json=confirmation)
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "WEIGHT_CHANGED"
    assert api.get(PREFIX + "/onboarding", headers=own).json()["active_goal"]["id"] == goal["id"]
    assert (
        api.post(
            path + "/apply-goal", headers=own, json={"expected_goal_id": goal["id"]}
        ).status_code
        == 422
    )
    preview = api.post(path + "/goal-preview", headers=own).json()
    fresh = api.post(
        path + "/apply-goal",
        headers=own,
        json={
            "expected_goal_id": preview["base_goal_id"],
            "expected_weight_kg": preview["current_weight_kg_snapshot"],
        },
    )
    assert fresh.status_code == 201
    assert Decimal(fresh.json()["current_weight_kg_snapshot"]) == Decimal("95")
    assert Decimal(fresh.json()["daily_calorie_target"]) == Decimal("1780")


def test_mvp_migration_0004_roundtrip_preserves_legacy_weight(pg_engine):
    config = Config("alembic.ini")
    user_id, weight_id = uuid4(), uuid4()
    with pg_engine.begin() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "0004")
        connection.execute(
            text("INSERT INTO users (id,auth_provider_subject) VALUES (:id,'legacy-phase4')"),
            {"id": user_id},
        )
        connection.execute(
            text(
                "INSERT INTO weight_logs (id,user_id,weight_kg,recorded_at) "
                "VALUES (:id,:user_id,97.125,now())"
            ),
            {"id": weight_id, "user_id": user_id},
        )
        command.upgrade(config, "head")
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "0007"
        assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []
    with Session(pg_engine) as db:
        weight = db.get(WeightLog, weight_id)
        assert weight.source == "manual" and weight.external_id is None
        assert db.get(User, user_id).auth_provider_subject == "legacy-phase4"
    with pg_engine.begin() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "0004")
        assert (
            connection.scalar(
                text("SELECT weight_kg FROM weight_logs WHERE id=:id"), {"id": weight_id}
            )
            == 97.125
        )
        command.upgrade(config, "head")
        assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []
