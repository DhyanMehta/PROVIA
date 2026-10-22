from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import jwt
import pytest
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy import func, inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from alembic import command
from app.core.auth import TokenVerifier
from app.core.config import Settings
from app.db.base import Base
from app.db.models import FitnessGoal, Food, MealLog, User
from app.modules.users.repository import UserRepository

pytestmark = pytest.mark.integration


@pytest.fixture
def authenticated_client(db_application):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    verifier = TokenVerifier(
        Settings(
            _env_file=None,
            auth_issuer="https://test.example/",
            auth_audience="provia",
            auth_jwks_url="https://test.example/jwks",
        )
    )
    client = jwt.PyJWKClient("https://test.example/jwks")
    jwk = jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key(), as_dict=True)
    jwk.update(kid="integration", alg="RS256", use="sig")
    client.fetch_data = lambda: {"keys": [jwk]}
    verifier._client = client
    db_application.state.token_verifier = verifier

    def headers(subject="user-a"):
        claims = {
            "sub": subject,
            "iss": "https://test.example/",
            "aud": "provia",
            "exp": datetime.now(UTC) + timedelta(minutes=5),
        }
        token = jwt.encode(claims, key, algorithm="RS256", headers={"kid": "integration"})
        return {"Authorization": "Bearer " + token}

    with TestClient(db_application) as api:
        yield api, headers


def test_migration_roundtrip_and_no_drift(pg_engine):
    with pg_engine.begin() as connection:
        tables = inspect(connection).get_table_names()
        assert set(Base.metadata.tables) <= set(tables)
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "0002"
        for name, table in Base.metadata.tables.items():
            assert len(inspect(connection).get_foreign_keys(name)) == len(table.foreign_keys)
        assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []
        config = Config("alembic.ini")
        config.attributes["connection"] = connection
        command.downgrade(config, "base")
        assert inspect(connection).get_table_names() == ["alembic_version"]
        command.upgrade(config, "head")
        assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []


def test_concurrent_provisioning(pg_engine):
    def provision(_):
        with Session(pg_engine) as session, session.begin():
            return UserRepository(session).resolve("same-subject", None).id

    with ThreadPoolExecutor(max_workers=4) as executor:
        ids = list(executor.map(provision, range(8)))
    assert len(set(ids)) == 1
    with Session(pg_engine) as session:
        assert session.scalar(select(func.count()).select_from(User)) == 1


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


def test_dashboard_tracks_meal_changes(authenticated_client):
    api, headers = authenticated_client
    own = headers()
    path = "/api/v1/nutrition/dashboard?date=2026-01-01"
    assert api.get(path, headers=own).json()["calories"]["target"] is None
    api.post(
        "/api/v1/goals",
        headers=own,
        json={"current_weight_kg": 97, "target_weight_kg": 85, "deficit_kcal": 500},
    )
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
        user = UserRepository(session).resolve("constraint-test", None)
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
