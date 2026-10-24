from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import event, select, text
from sqlalchemy.orm import Session

from app.db.models import User, WaterLog

pytestmark = pytest.mark.integration
PREFIX = "/api/v1"
RANGE = "start_date=2026-01-01&end_date=2026-01-03"


def request(api, headers, method, path, payload=None, status=200):
    response = api.request(method, PREFIX + path, headers=headers, json=payload)
    assert response.status_code == status, response.text
    return response.json() if status != 204 else None


def exercise(api, own):
    return request(
        api,
        own,
        "POST",
        "/exercises/custom",
        {
            "name": "Test row",
            "muscle_group": "back",
            "equipment": "dumbbell",
            "category": "strength",
        },
        201,
    )


def start(api, own, **values):
    return request(
        api, own, "POST", "/workout-sessions", {"started_at": "2026-01-01T12:00:00Z", **values}, 201
    )


def test_exercises_search_filters_archive_and_isolation(authenticated_client):
    api, headers = authenticated_client
    own, other = headers(), headers("user-b")
    seeds = request(api, own, "GET", "/exercises?category=bodyweight&equipment=bodyweight")
    assert len(seeds["items"]) == 2
    ex = exercise(api, own)
    assert (
        request(api, own, "GET", "/exercises?q=Test%20row&muscle_group=back&limit=1")["items"][0][
            "id"
        ]
        == ex["id"]
    )
    assert request(api, other, "GET", "/exercises?q=Test%20row")["items"] == []
    request(api, other, "GET", f"/exercises/{ex['id']}", status=404)
    for method in ("PATCH", "DELETE"):
        body = {"name": "bad"} if method == "PATCH" else None
        request(api, other, method, f"/exercises/custom/{ex['id']}", body, 404)
        request(api, own, method, f"/exercises/custom/{seeds['items'][0]['id']}", body, 404)
    request(api, own, "PATCH", f"/exercises/custom/{ex['id']}", {"name": "Renamed"})
    request(api, own, "DELETE", f"/exercises/custom/{ex['id']}", status=204)
    assert request(api, own, "GET", "/exercises?q=Renamed")["items"] == []
    assert request(api, own, "GET", f"/exercises/{ex['id']}")["is_archived"] is True


def test_plan_schedule_atomic_updates_and_history(authenticated_client):
    api, headers = authenticated_client
    own, other = headers(), headers("user-b")
    ex = exercise(api, own)
    days = [
        {
            "day_of_week": 0,
            "name": "Pull",
            "exercises": [
                {
                    "exercise_id": ex["id"],
                    "order_index": 0,
                    "target_sets": 3,
                    "target_reps": 8,
                    "target_weight_kg": "25",
                }
            ],
        },
        {"day_of_week": 1, "name": "Rest", "is_rest": True},
    ]
    plan = request(api, own, "POST", "/workout-plans", {"name": "Weekly", "days": days}, 201)
    plan_id = plan["id"]
    day_id = plan["days"][0]["id"]
    request(api, other, "GET", f"/workout-plans/{plan_id}", status=404)
    request(api, other, "PATCH", f"/workout-plans/{plan_id}", {"name": "bad"}, 404)
    request(api, other, "DELETE", f"/workout-plans/{plan_id}", status=404)
    request(api, other, "POST", "/workout-plans", {"name": "bad", "days": days}, 404)
    request(
        api,
        other,
        "POST",
        "/workout-sessions",
        {"started_at": "2026-01-01T12:00:00Z", "workout_plan_day_id": day_id},
        404,
    )
    request(
        api,
        own,
        "POST",
        "/workout-sessions",
        {"started_at": "2026-01-01T12:00:00Z", "workout_plan_day_id": plan["days"][1]["id"]},
        422,
    )
    workout = start(api, own, workout_plan_day_id=day_id)
    request(
        api,
        own,
        "POST",
        f"/workout-sessions/{workout['id']}/complete",
        {"completed_at": "2026-01-01T13:00:00Z"},
    )
    replacement = request(api, own, "POST", "/workout-plans", {"name": "Second"}, 201)
    assert request(api, own, "GET", f"/workout-plans/{plan_id}")["is_active"] is False
    copied = request(api, own, "POST", f"/workout-plans/{plan_id}/duplicate", status=201)
    assert copied["is_active"] is False
    assert copied["days"][0]["id"] != day_id
    bad_days = [
        {
            "day_of_week": 2,
            "name": "Bad",
            "exercises": [
                {"exercise_id": str(uuid4()), "order_index": 0, "target_sets": 2, "target_reps": 5}
            ],
        }
    ]
    request(
        api,
        own,
        "PATCH",
        f"/workout-plans/{plan_id}",
        {"is_active": True, "name": "Wrong", "days": bad_days},
        404,
    )
    assert request(api, own, "GET", f"/workout-plans/{replacement['id']}")["is_active"] is True
    assert request(api, own, "GET", f"/workout-plans/{plan_id}")["name"] == "Weekly"
    request(api, own, "PATCH", f"/workout-plans/{plan_id}", {"days": days, "is_active": True})
    saved = request(api, own, "GET", f"/workout-sessions/{workout['id']}")
    assert saved["workout_plan_day_id"] is None
    assert saved["plan_snapshot"] == workout["plan_snapshot"]
    request(api, own, "DELETE", f"/workout-plans/{plan_id}", status=204)
    assert request(api, own, "GET", f"/workout-sessions/{workout['id']}")["status"] == "completed"


def test_workout_sets_transitions_volume_and_records(authenticated_client, monkeypatch):
    class FixedClock(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 1, 3, 12, tzinfo=UTC).astimezone(tz)

    monkeypatch.setattr("app.modules.insights.service.datetime", FixedClock)
    api, headers = authenticated_client
    own, other = headers(), headers("user-b")
    ex = exercise(api, own)
    workout = start(api, own)
    path = f"/workout-sessions/{workout['id']}"
    request(api, other, "GET", path, status=404)
    request(api, other, "PATCH", path, {"status": "cancelled"}, 404)
    request(api, other, "POST", path + "/complete", {"completed_at": "2026-01-01T13:00:00Z"}, 404)
    base = {"exercise_id": ex["id"], "set_number": 1, "reps": 10, "weight_kg": "25"}
    item = request(api, own, "POST", path + "/sets", base, 201)
    request(api, own, "POST", path + "/sets", base, 409)
    request(api, own, "POST", path + "/complete", {"completed_at": "2026-01-01T13:00:00Z"}, 409)
    request(api, other, "POST", path + "/sets", base, 404)
    request(api, other, "PATCH", path + f"/sets/{item['id']}", {"is_completed": True}, 404)
    request(api, other, "DELETE", path + f"/sets/{item['id']}", status=404)
    request(api, own, "PATCH", path + f"/sets/{item['id']}", {"is_completed": True})
    request(
        api,
        own,
        "POST",
        path + "/sets",
        {**base, "set_number": 2, "kind": "warmup", "is_completed": True, "weight_kg": 999},
        201,
    )
    request(
        api,
        own,
        "POST",
        path + "/sets",
        {**base, "set_number": 3, "is_skipped": True, "weight_kg": 888},
        201,
    )
    extra = request(api, own, "POST", path + "/sets", {**base, "set_number": 4}, 201)
    request(api, own, "DELETE", path + f"/sets/{extra['id']}", status=204)
    request(api, own, "POST", path + "/complete", {"completed_at": "2026-01-01T11:00:00Z"}, 422)
    request(api, own, "POST", path + "/complete", {"completed_at": "2026-01-01T13:00:00Z"})
    request(api, own, "POST", path + "/complete", {"completed_at": "2026-01-01T13:00:00Z"}, 409)
    request(api, own, "PATCH", path + f"/sets/{item['id']}", {"reps": 20}, 409)
    request(api, own, "DELETE", path + f"/sets/{item['id']}", status=409)
    request(api, own, "POST", path + "/sets", base, 409)
    cancelled = start(api, own)
    request(api, own, "PATCH", f"/workout-sessions/{cancelled['id']}", {"status": "cancelled"})
    request(
        api,
        own,
        "POST",
        f"/workout-sessions/{cancelled['id']}/complete",
        {"completed_at": "2026-01-01T13:00:00Z"},
        409,
    )
    summary = request(api, own, "GET", "/workouts/summary?" + RANGE)
    assert summary["total_workouts"] == 1
    assert Decimal(summary["total_volume_kg"]) == 250
    assert summary["total_duration_seconds"] == 3600
    assert summary["active_days"] == 1
    assert summary["workouts_this_week"] == summary["workouts_this_month"] == 1
    dashboard = request(api, own, "GET", "/dashboard/today?date=2026-01-03")
    assert dashboard["workouts"]["total_workouts"] == 0
    assert dashboard["workouts"]["workouts_this_week"] == 1
    assert dashboard["workouts"]["workouts_this_month"] == 1
    assert summary["daily"][1]["count"] == 0
    assert summary["personal_records"][ex["id"]] == {
        "heaviest_weight_kg": "25.000",
        "highest_reps": 10,
        "highest_session_volume_kg": "250.000",
    }
    assert (
        request(api, own, "GET", f"/workouts/exercises/{ex['id']}/history?{RANGE}")[
            "total_workouts"
        ]
        == 1
    )
    assert request(api, other, "GET", "/workouts/progress?" + RANGE)["total_workouts"] == 0


def test_water_targets_logs_history_and_isolation(authenticated_client):
    api, headers = authenticated_client
    own, other = headers(), headers("user-b")
    empty = request(api, own, "GET", "/water/dashboard?date=2026-01-01")
    assert empty["target_ml"] is None and empty["has_logs"] is False
    request(api, own, "PUT", "/water/target", {"effective_date": "2026-01-01", "target_ml": 2000})
    request(api, own, "PUT", "/water/target", {"effective_date": "2026-01-02", "target_ml": 2400})
    log = request(
        api,
        own,
        "POST",
        "/water-logs",
        {"amount_ml": 250, "consumed_at": "2026-01-01T12:00:00Z"},
        201,
    )
    request(api, other, "PATCH", f"/water-logs/{log['id']}", {"amount_ml": 800}, 404)
    request(api, other, "DELETE", f"/water-logs/{log['id']}", status=404)
    request(api, own, "PATCH", f"/water-logs/{log['id']}", {"amount_ml": 500})
    day = request(api, own, "GET", "/water/dashboard?date=2026-01-01")
    assert Decimal(day["remaining_ml"]) == 1500
    assert (
        Decimal(request(api, own, "GET", "/water/dashboard?date=2026-01-02")["target_ml"]) == 2400
    )
    assert len(request(api, own, "GET", "/water-logs?" + RANGE)["items"]) == 1
    assert request(api, other, "GET", "/water-logs?" + RANGE)["items"] == []
    assert request(api, other, "GET", "/water/dashboard?date=2026-01-01")["target_ml"] is None
    request(api, own, "DELETE", f"/water-logs/{log['id']}", status=204)
    assert request(api, own, "GET", "/water/dashboard?date=2026-01-01")["has_logs"] is False


def test_activity_sync_precedence_idempotency_and_zero(authenticated_client):
    api, headers = authenticated_client
    own, other = headers(), headers("user-b")
    assert request(api, own, "GET", "/activity/daily?date=2026-01-01") is None
    manual = {"activity_date": "2026-01-01", "steps": 0}
    first = request(api, own, "PUT", "/activity/daily", manual)
    assert first["steps"] == 0
    assert request(api, own, "PUT", "/activity/daily", manual)["id"] == first["id"]
    sync = {
        **manual,
        "steps": 4000,
        "source": "health_connect",
        "synced_at": "2026-01-02T00:00:00Z",
        "active_minutes": 30,
        "activity_calories": 200,
    }
    assert request(api, own, "PUT", "/activity/daily", sync)["id"] == first["id"]
    request(api, own, "PUT", "/activity/daily", sync)
    request(api, own, "PUT", "/activity/daily", {**sync, "steps": 4001}, 409)
    request(api, own, "PUT", "/activity/daily", {**sync, "synced_at": "2026-01-01T23:00:00Z"}, 409)
    request(api, own, "PUT", "/activity/daily", manual, 409)
    summary = request(api, own, "GET", "/activity/summary?" + RANGE)
    assert summary["total_steps"] == 4000 and summary["observed_days"] == 1
    assert request(api, other, "GET", "/activity/daily?date=2026-01-01") is None


def test_sleep_wakeup_date_overlap_stages_and_import_dedup(authenticated_client):
    api, headers = authenticated_client
    own, other = headers(), headers("user-b")
    body = {
        "started_at": "2026-01-01T22:00:00Z",
        "ended_at": "2026-01-02T06:00:00Z",
        "source": "health_connect",
        "external_id": "night-1",
    }
    night = request(api, own, "POST", "/sleep-sessions", body, 201)
    assert night["duration_seconds"] == 28800 and night["stages"] is None
    assert request(api, own, "POST", "/sleep-sessions", body, 201)["id"] == night["id"]
    request(api, own, "POST", "/sleep-sessions", {**body, "ended_at": "2026-01-02T07:00:00Z"}, 409)
    request(api, own, "POST", "/sleep-sessions", {**body, "external_id": "night-2"}, 409)
    for method in ("GET", "PATCH", "DELETE"):
        request(
            api,
            other,
            method,
            f"/sleep-sessions/{night['id']}",
            {"notes": "bad"} if method == "PATCH" else None,
            404,
        )
    request(
        api,
        own,
        "PATCH",
        f"/sleep-sessions/{night['id']}",
        {"ended_at": "2026-01-01T21:00:00Z"},
        422,
    )
    request(
        api,
        own,
        "PATCH",
        f"/sleep-sessions/{night['id']}",
        {
            "stages": [
                {
                    "stage": "deep",
                    "started_at": "2026-01-01T23:00:00Z",
                    "ended_at": "2026-01-02T01:00:00Z",
                }
            ]
        },
    )
    summary = request(api, own, "GET", "/sleep/summary?" + RANGE)
    assert summary["daily"][0]["duration_seconds"] is None
    assert summary["daily"][1]["duration_seconds"] == 28800
    assert len(request(api, own, "GET", "/sleep-sessions?" + RANGE)["items"]) == 1
    request(api, own, "DELETE", f"/sleep-sessions/{night['id']}", status=204)
    assert request(api, own, "GET", "/sleep-sessions?" + RANGE)["items"] == []


def test_dashboard_progress_historical_nutrition_and_query_count(authenticated_client, pg_engine):
    api, headers = authenticated_client
    own, other = headers(), headers("user-b")
    profile = {
        "display_name": "Test",
        "height_cm": 175,
        "current_weight_kg": 97,
        "activity_level": "moderate",
        "timezone": "Asia/Kolkata",
    }
    request(api, own, "PUT", "/profile", profile)
    goal = request(
        api,
        own,
        "POST",
        "/goals",
        {
            "goal_type": "weight_loss",
            "current_weight_kg": 97,
            "target_weight_kg": 85,
            "selected_deficit_kcal": 500,
        },
        201,
    )
    request(api, own, "PATCH", f"/goals/{goal['id']}", {"status": "paused"})
    with pg_engine.begin() as connection:
        connection.execute(
            text(
                "UPDATE goal_transitions SET effective_at = CASE WHEN goal_id IS NULL "
                "THEN '2026-01-02T18:30:00Z'::timestamptz "
                "ELSE '2025-12-31T18:30:00Z'::timestamptz END"
            )
        )
    food = request(
        api,
        own,
        "POST",
        "/foods/custom",
        {
            "name": "Known",
            "calories_kcal": 200,
            "protein_g": 10,
            "carbs_g": 20,
            "fat_g": 5,
            "fiber_g": 1,
        },
        201,
    )
    request(
        api,
        own,
        "POST",
        "/meals",
        {
            "meal_type": "lunch",
            "consumed_at": "2026-01-01T12:00:00Z",
            "items": [{"food_id": food["id"], "quantity_g": 100}],
        },
        201,
    )
    request(
        api,
        own,
        "PUT",
        "/activity/daily",
        {"activity_date": "2026-01-01", "steps": 10000, "activity_calories": 900},
    )
    request(
        api,
        own,
        "POST",
        "/water-logs",
        {"amount_ml": 300, "consumed_at": "2025-12-31T18:30:00Z"},
        201,
    )
    request(
        api,
        own,
        "POST",
        "/water-logs",
        {"amount_ml": 400, "consumed_at": "2026-01-01T18:30:00Z"},
        201,
    )
    request(
        api,
        own,
        "POST",
        "/weight-logs",
        {"weight_kg": 97, "recorded_at": "2026-01-01T12:00:00Z"},
        201,
    )
    request(
        api,
        own,
        "POST",
        "/weight-logs",
        {"weight_kg": 96, "recorded_at": "2026-01-02T12:00:00Z"},
        201,
    )
    dashboard = request(api, own, "GET", "/dashboard/today?date=2026-01-01")
    assert Decimal(dashboard["nutrition"]["daily_calorie_target"]) == 1828
    assert Decimal(dashboard["nutrition"]["calories"]["remaining"]) == 1628
    assert Decimal(dashboard["water"]["consumed_ml"]) == 300
    assert dashboard["activity"]["steps"] == 10000
    queries = []

    def count(*args):
        queries.append(1)

    event.listen(pg_engine, "before_cursor_execute", count)
    try:
        progress = request(api, own, "GET", "/progress/overview?" + RANGE)
        short_count = len(queries)
        queries.clear()
        request(api, own, "GET", "/progress/overview?start_date=2026-01-01&end_date=2026-12-31")
        assert len(queries) <= short_count + 1
    finally:
        event.remove(pg_engine, "before_cursor_execute", count)
    assert Decimal(progress["daily"][0]["nutrition"]["calories_target"]) == 1828
    assert progress["daily"][1]["nutrition"]["calories_consumed"] is None
    assert progress["daily"][2]["nutrition"]["calories_target"] is None
    assert Decimal(progress["weight_change_kg"]) == -1
    assert request(api, other, "GET", "/dashboard/today?date=2026-01-01")["activity"] is None
    assert request(api, other, "GET", "/progress/overview?" + RANGE)["weight_history"] == []


@pytest.mark.parametrize(
    "timezone,start,end",
    [
        ("America/New_York", "2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z"),
        ("America/New_York", "2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z"),
    ],
)
def test_day2_dst_boundaries(authenticated_client, timezone, start, end):
    api, headers = authenticated_client
    own = headers()
    request(
        api,
        own,
        "PUT",
        "/profile",
        {
            "display_name": "DST",
            "height_cm": 175,
            "current_weight_kg": 70,
            "activity_level": "light",
            "timezone": timezone,
        },
    )
    for timestamp in (start, end):
        request(api, own, "POST", "/water-logs", {"amount_ml": 250, "consumed_at": timestamp}, 201)
    assert (
        Decimal(request(api, own, "GET", f"/water/dashboard?date={start[:10]}")["consumed_ml"])
        == 250
    )


def test_day2_auth_validation_and_range_errors(authenticated_client):
    api, headers = authenticated_client
    own = headers()
    for path in (
        "/exercises",
        "/workout-plans",
        "/workout-sessions",
        "/water-logs",
        "/activity/daily?date=2026-01-01",
        "/sleep-sessions",
        "/dashboard/today",
        "/progress/overview",
    ):
        request(api, {}, "GET", path, status=401)
        request(api, {"Authorization": "Bearer invalid"}, "GET", path, status=401)
    for path, payload in [
        ("/water-logs", {"amount_ml": -1, "consumed_at": "2026-01-01T00:00:00Z"}),
        (
            "/sleep-sessions",
            {"started_at": "2026-01-02T00:00:00Z", "ended_at": "2026-01-01T00:00:00Z"},
        ),
        ("/workout-sessions", {"started_at": "2026-01-01T00:00:00"}),
    ]:
        request(api, own, "POST", path, payload, 422)
    for path in (
        "/workouts/summary",
        "/progress/overview",
        "/sleep/summary",
        "/activity/summary",
        "/water-logs",
    ):
        request(api, own, "GET", path + "?start_date=2026-02-01&end_date=2026-01-01", status=422)
        request(api, own, "GET", path + "?start_date=2020-01-01&end_date=2026-01-01", status=422)
    workout = start(api, own)
    ex = exercise(api, own)
    for values in ({"weight_kg": -1}, {"reps": -1}, {"is_completed": True, "is_skipped": True}):
        request(
            api,
            own,
            "POST",
            f"/workout-sessions/{workout['id']}/sets",
            {"exercise_id": ex["id"], "set_number": 1, **values},
            422,
        )


def test_migration_preserves_existing_tracking_records(pg_engine):
    from alembic.config import Config

    from alembic import command

    with pg_engine.begin() as connection:
        config = Config("alembic.ini")
        config.attributes["connection"] = connection
        command.downgrade(config, "0003")
        owner, log = uuid4(), uuid4()
        connection.execute(
            text("INSERT INTO users (id,auth_provider_subject) VALUES (:id,'migration-owner')"),
            {"id": owner},
        )
        connection.execute(
            text(
                "INSERT INTO water_logs (id,user_id,amount_ml,consumed_at) "
                "VALUES (:id,:owner,375,'2026-01-01T00:00:00Z')"
            ),
            {"id": log, "owner": owner},
        )
        command.upgrade(config, "head")
    with Session(pg_engine) as session:
        assert session.get(WaterLog, log).amount_ml == 375
        assert session.scalar(select(User.id).where(User.id == owner)) == owner


def test_concurrent_active_plans_and_sleep_imports(authenticated_client):
    api, headers = authenticated_client
    own = headers()
    request(api, own, "GET", "/me")
    with ThreadPoolExecutor(max_workers=2) as executor:
        plans = list(
            executor.map(
                lambda name: request(api, own, "POST", "/workout-plans", {"name": name}, 201),
                ["First", "Second"],
            )
        )
    assert len(plans) == 2
    assert sum(row["is_active"] for row in request(api, own, "GET", "/workout-plans")["items"]) == 1
    body = {
        "started_at": "2026-01-01T22:00:00Z",
        "ended_at": "2026-01-02T06:00:00Z",
        "source": "health_connect",
        "external_id": "parallel",
    }
    with ThreadPoolExecutor(max_workers=2) as executor:
        nights = list(
            executor.map(
                lambda _: request(api, own, "POST", "/sleep-sessions", body, 201), range(2)
            )
        )
    assert nights[0]["id"] == nights[1]["id"]
