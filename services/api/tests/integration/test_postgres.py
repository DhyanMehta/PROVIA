from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import func, inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from alembic import command
from app.db.base import Base
from app.db.models import FitnessGoal, Food, GoalTransition, MealLog, Recipe, User, WeightLog

pytestmark = pytest.mark.integration


def test_migration_roundtrip_and_no_drift(pg_engine):
    with pg_engine.begin() as connection:
        tables = inspect(connection).get_table_names()
        assert set(Base.metadata.tables) <= set(tables)
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "0005"
        for name, table in Base.metadata.tables.items():
            assert len(inspect(connection).get_foreign_keys(name)) == len(table.foreign_keys)
        assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []
        config = Config("alembic.ini")
        config.attributes["connection"] = connection
        command.downgrade(config, "base")
        assert inspect(connection).get_table_names() == ["alembic_version"]
        command.upgrade(config, "head")
        assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []


def test_auth_upgrade_preserves_legacy_identity_and_fitness_records(pg_engine):
    config = Config("alembic.ini")
    with pg_engine.begin() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "0004")
    user_id, weight_id = uuid4(), uuid4()
    with Session(pg_engine) as db, db.begin():
        db.add(User(id=user_id, auth_provider_subject="legacy-preserved", email="old@example.com"))
        db.flush()
        db.add(
            WeightLog(
                id=weight_id,
                user_id=user_id,
                weight_kg=Decimal("97"),
                recorded_at=datetime.now(UTC),
            )
        )
    with pg_engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
        assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []
    with Session(pg_engine) as db:
        assert db.get(User, user_id).auth_provider_subject == "legacy-preserved"
        record = db.get(WeightLog, weight_id)
        assert record.user_id == user_id and record.weight_kg == Decimal("97")
    with pg_engine.begin() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "0004")
    with Session(pg_engine) as db:
        assert db.get(User, user_id) is not None and db.get(WeightLog, weight_id) is not None


def test_profile_goal_weight_crud_and_isolation(authenticated_client):
    api, headers = authenticated_client
    own, other = headers(), headers("user-b")
    assert api.get("/api/v1/health/db").status_code == 200
    me = api.get("/api/v1/me", headers=own)
    assert me.status_code == 200
    assert "auth_provider_subject" not in me.json()
    assert api.patch("/api/v1/me", headers=own, json={"email": "me@example.com"}).status_code == 200
    profile = {
        "display_name": "Test",
        "height_cm": "175",
        "current_weight_kg": "70",
        "activity_level": "moderate",
        "timezone": "Asia/Kolkata",
    }
    assert api.put("/api/v1/profile", headers=own, json=profile).status_code == 200
    assert (
        api.put("/api/v1/profile", headers=own, json={**profile, "display_name": "Updated"}).json()[
            "display_name"
        ]
        == "Updated"
    )
    assert api.get("/api/v1/profile", headers=other).status_code == 404
    goal = api.post(
        "/api/v1/goals",
        headers=own,
        json={
            "goal_type": "maintenance",
            "current_weight_kg": 97,
            "target_weight_kg": 85,
            "selected_deficit_kcal": 500,
        },
    )
    assert goal.status_code == 201
    goal_id = goal.json()["id"]
    assert (
        api.post(
            "/api/v1/goals",
            headers=own,
            json={
                "goal_type": "general_fitness",
                "current_weight_kg": 97,
                "target_weight_kg": 85,
                "selected_deficit_kcal": 500,
            },
        ).status_code
        == 201
    )
    goals = api.get("/api/v1/goals", headers=own).json()["items"]
    assert sum(item["status"] == "active" for item in goals) == 1
    assert (
        api.patch(f"/api/v1/goals/{goal_id}", headers=own, json={"status": "active"}).status_code
        == 200
    )
    assert (
        api.patch(f"/api/v1/goals/{goal_id}", headers=other, json={"status": "paused"}).status_code
        == 404
    )
    assert api.get("/api/v1/goals", headers=other).json()["items"] == []
    for weight in [70, 71]:
        assert (
            api.post("/api/v1/weight-logs", headers=own, json={"weight_kg": weight}).status_code
            == 201
        )
    assert len(api.get("/api/v1/weight-logs?limit=1&offset=1", headers=own).json()["items"]) == 1
    assert api.get("/api/v1/weight-logs", headers=other).json()["items"] == []
    assert api.post("/api/v1/weight-logs", headers=own, json={"weight_kg": -1}).status_code == 422


def test_food_meal_summary_snapshots_and_isolation(authenticated_client, pg_engine):
    api, headers = authenticated_client
    own, other = headers(), headers("user-b")
    profile = {
        "display_name": "Test",
        "height_cm": 175,
        "current_weight_kg": 70,
        "activity_level": "moderate",
        "timezone": "Asia/Kolkata",
    }
    api.put("/api/v1/profile", headers=own, json=profile)
    api.post(
        "/api/v1/goals",
        headers=own,
        json={
            "goal_type": "maintenance",
            "current_weight_kg": 97,
            "target_weight_kg": 85,
            "selected_deficit_kcal": 500,
        },
    )
    with Session(pg_engine) as session, session.begin():
        session.execute(text("UPDATE goal_transitions SET effective_at = '2025-01-01T00:00:00Z'"))
    food_response = api.post(
        "/api/v1/foods/custom",
        headers=own,
        json={
            "name": "Oats",
            "calories_kcal": 200,
            "protein_g": 10,
            "carbs_g": 30,
            "fat_g": 5,
            "portions": [{"label": "scoop", "grams": 30}],
        },
    )
    assert food_response.status_code == 201
    food = food_response.json()
    food_id = food["id"]
    assert api.get(f"/api/v1/foods/{food_id}", headers=other).status_code == 404
    assert (
        len(api.get("/api/v1/foods/search?q=Oats&source=local", headers=own).json()["items"]) == 1
    )
    assert api.get("/api/v1/foods/search?q=Oats&source=local", headers=other).json()["items"] == []
    data = {
        "meal_type": "breakfast",
        "consumed_at": "2025-12-31T18:30:00Z",
        "items": [
            {"food_id": food_id, "quantity_g": 50},
            {"food_id": food_id, "portion_id": food["portions"][0]["id"], "portion_count": 2},
        ],
    }
    response = api.post("/api/v1/meals", headers=own, json=data)
    assert response.status_code == 201
    meal_id = response.json()["id"]
    assert Decimal(response.json()["totals"]["calories_kcal"]) == 220
    assert response.json()["totals"]["fiber_g"] is None
    with Session(pg_engine) as session, session.begin():
        from uuid import UUID

        session.get(Food, UUID(food_id)).calories_kcal = 300
    assert (
        Decimal(api.get(f"/api/v1/meals/{meal_id}", headers=own).json()["totals"]["calories_kcal"])
        == 220
    )
    summary = api.get("/api/v1/nutrition/daily?date=2026-01-01", headers=own).json()
    assert Decimal(summary["totals"]["calories_kcal"]) == 220
    assert Decimal(summary["targets"]["calories_kcal"]) == 1828
    assert api.get("/api/v1/nutrition/daily?date=2025-12-31", headers=own).json()["meals"] == []
    assert len(api.get("/api/v1/meals?date=2026-01-01", headers=own).json()["items"]) == 1
    for method in ["GET", "PATCH", "DELETE"]:
        kwargs = {"json": {"notes": "unauthorized"}} if method == "PATCH" else {}
        assert (
            api.request(method, f"/api/v1/meals/{meal_id}", headers=other, **kwargs).status_code
            == 404
        )
    assert api.post("/api/v1/meals", headers=other, json=data).status_code == 404
    updated = api.patch(
        f"/api/v1/meals/{meal_id}",
        headers=own,
        json={"items": [{"food_id": food_id, "quantity_g": 100}]},
    )
    assert updated.status_code == 200
    assert Decimal(updated.json()["totals"]["calories_kcal"]) == 300
    assert api.delete(f"/api/v1/meals/{meal_id}", headers=own).status_code == 204
    assert api.get(f"/api/v1/meals/{meal_id}", headers=own).status_code == 404


def test_atomic_meal_failure(authenticated_client, pg_engine):
    api, headers = authenticated_client
    own = headers()
    food = api.post("/api/v1/foods/custom", headers=own, json={"name": "Test"}).json()
    response = api.post(
        "/api/v1/meals",
        headers=own,
        json={
            "meal_type": "lunch",
            "items": [
                {"food_id": food["id"], "quantity_g": 100},
                {"food_id": str(uuid4()), "quantity_g": 100},
            ],
        },
    )
    assert response.status_code == 404
    with Session(pg_engine) as session:
        assert session.scalar(select(func.count()).select_from(MealLog)) == 0


def test_calculated_goal_history_and_profile_edits(authenticated_client):
    api, headers = authenticated_client
    own = headers()
    profile = {
        "display_name": "Test",
        "height_cm": 175,
        "current_weight_kg": 97,
        "activity_level": "moderate",
        "timezone": "UTC",
    }
    assert api.put("/api/v1/profile", headers=own, json=profile).status_code == 200
    goal = api.post(
        "/api/v1/goals",
        headers=own,
        json={"current_weight_kg": 100, "target_weight_kg": 85, "deficit_kcal": 500},
    ).json()
    assert Decimal(goal["daily_calorie_target"]) == 1900
    api.put("/api/v1/profile", headers=own, json={**profile, "display_name": "Renamed"})
    assert len(api.get("/api/v1/goals", headers=own).json()["items"]) == 1
    response = api.put("/api/v1/profile", headers=own, json={**profile, "current_weight_kg": 98})
    assert response.status_code == 200
    goals = api.get("/api/v1/goals", headers=own).json()["items"]
    assert len(goals) == 2
    active = next(item for item in goals if item["status"] == "active")
    assert Decimal(active["daily_calorie_target"]) == 1852
    old = next(item for item in goals if item["id"] == goal["id"])
    assert old["status"] == "paused"
    assert Decimal(old["current_weight_kg_snapshot"]) == 100
    revised = api.patch(f"/api/v1/goals/{active['id']}", headers=own, json={"deficit_kcal": 400})
    assert revised.status_code == 200
    assert revised.json()["id"] != active["id"]
    assert Decimal(revised.json()["daily_calorie_target"]) == 1952


def test_dashboard_tracks_meal_changes(authenticated_client, pg_engine):
    api, headers = authenticated_client
    own = headers()
    path = "/api/v1/nutrition/dashboard?date=2026-01-01"
    assert api.get(path, headers=own).json()["calories"]["target"] is None
    api.post(
        "/api/v1/goals",
        headers=own,
        json={"current_weight_kg": 97, "target_weight_kg": 85, "deficit_kcal": 500},
    )
    with Session(pg_engine) as session, session.begin():
        session.execute(text("UPDATE goal_transitions SET effective_at = '2025-01-01T00:00:00Z'"))
    food = api.post(
        "/api/v1/foods/custom",
        headers=own,
        json={
            "name": "Synthetic test fixture",
            "calories_kcal": 300,
            "protein_g": 25,
            "carbs_g": 20,
            "fat_g": 10,
            "fiber_g": 5,
        },
    ).json()
    meal = {
        "meal_type": "lunch",
        "consumed_at": "2026-01-01T12:00:00Z",
        "items": [{"food_id": food["id"], "quantity_g": 100}],
    }
    first = api.post("/api/v1/meals", headers=own, json=meal).json()
    dashboard = api.get(path, headers=own).json()
    assert Decimal(dashboard["calories"]["remaining"]) == 1528
    assert Decimal(dashboard["protein"]["remaining_g"]) == Decimal("136.5")
    assert Decimal(dashboard["protein"]["remaining_kcal"]) == 546
    second = api.post("/api/v1/meals", headers=own, json={**meal, "meal_type": "snack"}).json()
    assert Decimal(api.get(path, headers=own).json()["calories"]["consumed"]) == 600
    api.patch(
        f"/api/v1/meals/{first['id']}",
        headers=own,
        json={"items": [{"food_id": food["id"], "quantity_g": 600}]},
    )
    assert Decimal(api.get(path, headers=own).json()["calories"]["remaining"]) == -272
    assert api.get(path, headers=headers("other")).json()["meals"] == []
    for item in [first, second]:
        assert api.delete(f"/api/v1/meals/{item['id']}", headers=own).status_code == 204
    assert Decimal(api.get(path, headers=own).json()["calories"]["remaining"]) == 1828


def test_catalog_import_aliases_and_provider_search(
    authenticated_client, pg_engine, db_application
):
    from unittest.mock import MagicMock

    from app.integrations.foods import NormalizedFood, NormalizedPortion
    from app.integrations.indian_catalog import CuratedRecord
    from app.modules.nutrition.repository import NutritionRepository

    # Metadata-only record: no invented nutrition values enter the bundled catalog.
    record = CuratedRecord(
        name="Catalog test",
        source_food_id="test-only",
        source_url="https://example.com/test",
        license_name="test-fixture",
        aliases=["Chapati"],
    ).normalized()
    with Session(pg_engine) as session, session.begin():
        repository = NutritionRepository(session)
        first = repository.import_foods([record, record])
        second = repository.import_foods([record])
        assert len(first) == 1 and first[0].id == second[0].id
    api, headers = authenticated_client
    result = api.get("/api/v1/foods/search?q=CHAPATI&source=indian_curated", headers=headers())
    assert result.status_code == 200
    assert result.json()["items"][0]["calories_kcal"] is None
    provider = MagicMock()
    provider.search.return_value = [
        NormalizedFood(
            name="Provider test",
            source="usda",
            source_food_id="test",
            portions=[NormalizedPortion(label="test portion", grams=30)],
        )
    ]
    db_application.state.food_providers["usda"] = provider
    result = api.get("/api/v1/foods/search?q=test&source=usda", headers=headers())
    assert result.status_code == 200
    assert result.json()["provider_status"]["usda"] == "ok"
    imported = next(item for item in result.json()["items"] if item["source"] == "usda")
    assert Decimal(imported["portions"][0]["grams"]) == 30


def test_database_constraints(pg_engine):
    with Session(pg_engine) as session, session.begin():
        user = User(auth_provider_subject="constraint-test")
        session.add(user)
        session.flush()
        user_id = user.id
        session.add(FitnessGoal(user_id=user_id, goal_type="maintenance", status="active"))
    with pytest.raises(IntegrityError), Session(pg_engine) as session, session.begin():
        session.add(FitnessGoal(user_id=user_id, goal_type="weight_loss", status="active"))
    with pytest.raises(IntegrityError), Session(pg_engine) as session, session.begin():
        session.add(
            Food(
                name="Invalid",
                source="custom",
                created_by_user_id=user_id,
                serving_basis="100g",
                protein_g=-1,
            )
        )


def test_historical_goal_selection_and_pause(authenticated_client, pg_engine):
    from uuid import UUID

    api, headers = authenticated_client
    own = headers()
    first = api.post(
        "/api/v1/goals",
        headers=own,
        json={"current_weight_kg": 97, "target_weight_kg": 85, "deficit_kcal": 500},
    ).json()
    second = api.post(
        "/api/v1/goals",
        headers=own,
        json={"current_weight_kg": 90, "target_weight_kg": 85, "deficit_kcal": 400},
    ).json()
    assert (
        api.patch(
            f"/api/v1/goals/{second['id']}", headers=own, json={"status": "paused"}
        ).status_code
        == 200
    )
    with Session(pg_engine) as session, session.begin():
        events = session.scalars(select(GoalTransition).order_by(GoalTransition.effective_at)).all()
        assert [str(e.goal_id) if e.goal_id else None for e in events] == [
            first["id"],
            second["id"],
            None,
        ]
        for event, when in zip(
            events,
            ["2026-10-01T08:00:00+00:00", "2026-11-01T08:00:00+00:00", "2026-11-02T08:00:00+00:00"],
            strict=True,
        ):
            event.effective_at = datetime.fromisoformat(when)
        assert session.get(FitnessGoal, UUID(first["id"])).daily_calorie_target == 1828
    for day, expected in [
        ("2026-09-30", None),
        ("2026-10-01", 1828),
        ("2026-10-31", 1828),
        ("2026-11-01", 1760),
        ("2026-11-02", None),
    ]:
        dashboard = api.get(f"/api/v1/nutrition/dashboard?date={day}", headers=own).json()
        actual = dashboard["daily_calorie_target"]
        assert (Decimal(actual) if actual is not None else None) == expected
        daily = api.get(f"/api/v1/nutrition/daily?date={day}", headers=own).json()
        assert (
            Decimal(daily["targets"]["calories_kcal"]) if daily["targets"] else None
        ) == expected
        assert (
            api.get(f"/api/v1/nutrition/dashboard?date={day}", headers=headers("other")).json()[
                "daily_calorie_target"
            ]
            is None
        )
    # Reactivation creates a fresh event rather than rewriting the previous period.
    assert (
        api.patch(
            f"/api/v1/goals/{first['id']}", headers=own, json={"status": "active"}
        ).status_code
        == 200
    )
    assert (
        Decimal(
            api.get("/api/v1/nutrition/dashboard?date=2026-10-01", headers=own).json()[
                "daily_calorie_target"
            ]
        )
        == 1828
    )


@pytest.mark.parametrize(
    "timezone,day,start,end",
    [
        ("Asia/Kolkata", "2026-10-01", "2026-09-30T18:30:00+00:00", "2026-10-01T18:30:00+00:00"),
        (
            "America/New_York",
            "2026-03-08",
            "2026-03-08T05:00:00+00:00",
            "2026-03-09T04:00:00+00:00",
        ),
        (
            "America/New_York",
            "2026-11-01",
            "2026-11-01T04:00:00+00:00",
            "2026-11-02T05:00:00+00:00",
        ),
    ],
)
def test_historical_same_day_timezone_and_dst(
    authenticated_client, pg_engine, timezone, day, start, end
):
    api, headers = authenticated_client
    own = headers()
    api.put(
        "/api/v1/profile",
        headers=own,
        json={
            "display_name": "Test",
            "height_cm": 175,
            "current_weight_kg": 97,
            "activity_level": "moderate",
            "timezone": timezone,
        },
    )
    for deficit in [500, 400, 300]:
        assert (
            api.post(
                "/api/v1/goals",
                headers=own,
                json={"current_weight_kg": 97, "target_weight_kg": 85, "deficit_kcal": deficit},
            ).status_code
            == 201
        )
    with Session(pg_engine) as session, session.begin():
        events = session.scalars(select(GoalTransition).order_by(GoalTransition.effective_at)).all()
        events[0].effective_at = datetime.fromisoformat(start)
        events[1].effective_at = datetime.fromisoformat(end) - timedelta(microseconds=1)
        events[2].effective_at = datetime.fromisoformat(end)
    # Last transition strictly before the next midnight wins. A midnight change belongs to tomorrow.
    response = api.get(f"/api/v1/nutrition/dashboard?date={day}", headers=own)
    assert response.status_code == 200
    assert Decimal(response.json()["daily_calorie_target"]) == 1928


def test_weight_log_preview_and_confirm(authenticated_client, pg_engine):
    api, headers = authenticated_client
    own = headers()
    goal = api.post(
        "/api/v1/goals",
        headers=own,
        json={"current_weight_kg": 97, "target_weight_kg": 85, "deficit_kcal": 400},
    ).json()
    log = api.post("/api/v1/weight-logs", headers=own, json={"weight_kg": 90}).json()
    active = next(
        g for g in api.get("/api/v1/goals", headers=own).json()["items"] if g["status"] == "active"
    )
    assert active["id"] == goal["id"] and Decimal(active["daily_calorie_target"]) == 1928
    path = f"/api/v1/weight-logs/{log['id']}"
    preview = api.post(path + "/goal-preview", headers=own)
    assert preview.status_code == 200
    assert Decimal(preview.json()["daily_calorie_target"]) == 1760
    assert Decimal(preview.json()["target_weight_kg"]) == 85
    assert api.post(path + "/goal-preview", headers=headers("other")).status_code == 404
    confirmed = api.post(path + "/apply-goal", headers=own, json={"expected_goal_id": goal["id"]})
    assert confirmed.status_code == 201
    assert confirmed.json()["id"] != goal["id"]
    assert Decimal(confirmed.json()["daily_calorie_target"]) == 1760
    assert (
        api.post(
            path + "/apply-goal", headers=own, json={"expected_goal_id": goal["id"]}
        ).status_code
        == 409
    )
    with Session(pg_engine) as session:
        assert session.scalar(select(func.count()).select_from(GoalTransition)) == 2


def test_recipe_yield_portions_and_snapshots(authenticated_client, pg_engine):
    from uuid import UUID

    api, headers = authenticated_client
    own = headers()
    base = api.post(
        "/api/v1/foods/custom",
        headers=own,
        json={
            "name": "Synthetic ingredient",
            "food_kind": "ingredient",
            "calories_kcal": 100,
            "protein_g": 10,
            "carbs_g": 10,
            "fat_g": 2,
        },
    ).json()
    oil = api.post(
        "/api/v1/foods/custom",
        headers=own,
        json={
            "name": "Synthetic oil fixture",
            "food_kind": "ingredient",
            "calories_kcal": 900,
            "protein_g": 0,
            "carbs_g": 0,
            "fat_g": 100,
            "fiber_g": 0,
        },
    ).json()
    data = {
        "name": "Synthetic prepared recipe",
        "yield_g": 200,
        "aliases": ["test dish"],
        "ingredients": [
            {"food_id": base["id"], "quantity_g": 100},
            {"food_id": oil["id"], "quantity_g": 10},
        ],
        "portions": [{"label": "measured bowl", "grams": 50}],
    }
    response = api.post("/api/v1/recipes", headers=own, json=data)
    assert response.status_code == 201
    recipe = response.json()
    assert recipe["incomplete"] is True
    assert Decimal(recipe["food"]["calories_kcal"]) == 95
    assert Decimal(recipe["food"]["protein_g"]) == 5
    assert recipe["food"]["fiber_g"] is None
    assert recipe["food"]["food_kind"] == "recipe"
    assert api.get(f"/api/v1/recipes/{recipe['id']}", headers=own).status_code == 200
    assert api.get(f"/api/v1/recipes/{recipe['id']}", headers=headers("other")).status_code == 404
    assert api.post("/api/v1/recipes", headers=headers("other"), json=data).status_code == 404
    duplicate = {**data, "ingredients": [data["ingredients"][0], data["ingredients"][0]]}
    assert api.post("/api/v1/recipes", headers=own, json=duplicate).status_code == 422
    meal = api.post(
        "/api/v1/meals",
        headers=own,
        json={
            "meal_type": "dinner",
            "items": [
                {
                    "food_id": recipe["food"]["id"],
                    "portion_id": recipe["food"]["portions"][0]["id"],
                    "portion_count": 1,
                }
            ],
        },
    ).json()
    assert Decimal(meal["totals"]["calories_kcal"]) == Decimal("47.5")
    with Session(pg_engine) as session, session.begin():
        session.get(Food, UUID(base["id"])).calories_kcal = 1000
    unchanged = api.get(f"/api/v1/recipes/{recipe['id']}", headers=own).json()
    assert Decimal(unchanged["food"]["calories_kcal"]) == 95
    assert Decimal(unchanged["ingredients"][0]["calories_kcal_snapshot"]) in {100, 90}
    assert Decimal(
        api.get(f"/api/v1/meals/{meal['id']}", headers=own).json()["totals"]["calories_kcal"]
    ) == Decimal("47.5")
    with Session(pg_engine) as session:
        assert session.scalar(select(func.count()).select_from(Recipe)) == 1


def test_goal_transition_constraints_and_deletion(pg_engine):
    with Session(pg_engine) as session, session.begin():
        user = User(auth_provider_subject="transition")
        session.add(user)
        session.flush()
        goal = FitnessGoal(user_id=user.id, goal_type="maintenance", status="paused")
        session.add(goal)
        session.flush()
        when = datetime.now(UTC)
        session.add(GoalTransition(user_id=user.id, goal_id=goal.id, effective_at=when))
        user_id, goal_id = user.id, goal.id
    with pytest.raises(IntegrityError), Session(pg_engine) as session, session.begin():
        session.add(GoalTransition(user_id=user_id, goal_id=None, effective_at=when))
    with pytest.raises(IntegrityError), Session(pg_engine) as session, session.begin():
        session.delete(session.get(FitnessGoal, goal_id))


def test_migration_preserves_goals_without_inventing_history(pg_engine):
    with pg_engine.begin() as connection:
        config = Config("alembic.ini")
        config.attributes["connection"] = connection
        command.downgrade(config, "0002")
        user_id, goal_id = uuid4(), uuid4()
        connection.execute(
            text("INSERT INTO users (id, auth_provider_subject) VALUES (:id, 'legacy')"),
            {"id": user_id},
        )
        connection.execute(
            text(
                "INSERT INTO fitness_goals "
                "(id,user_id,goal_type,status,daily_calorie_target,created_at) "
                "VALUES (:id,:user,'maintenance','active',1800,'2020-01-01')"
            ),
            {"id": goal_id, "user": user_id},
        )
        before = connection.scalar(text("SELECT clock_timestamp()"))
        command.upgrade(config, "head")
        event = connection.execute(text("SELECT goal_id,effective_at FROM goal_transitions")).one()
        assert event.goal_id == goal_id and event.effective_at >= before
        assert (
            connection.scalar(
                text("SELECT daily_calorie_target FROM fitness_goals WHERE id=:id"), {"id": goal_id}
            )
            == 1800
        )
