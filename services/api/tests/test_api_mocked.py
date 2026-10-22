"""Test routing/serialization with controlled repositories; not database integration."""

from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app.core.auth import get_current_user
from app.db.dependencies import DbSession
from app.db.models import User, UserProfile
from app.modules.nutrition import router as nutrition_module
from app.modules.profiles import router as profiles_module


def prepare(application):
    now = datetime.now(UTC)
    user = User(
        id=uuid4(),
        email=None,
        auth_provider_subject="controlled-test-user",
        created_at=now,
        updated_at=now,
    )
    application.dependency_overrides[get_current_user] = lambda: user
    application.state.database = MagicMock()
    return user


def save(entity):
    entity.id = entity.id or uuid4()
    entity.created_at = datetime.now(UTC)
    entity.updated_at = datetime.now(UTC)
    if hasattr(entity, "aliases") and entity.aliases is None:
        entity.aliases = []
    for item in getattr(entity, "items", []):
        item.id = uuid4()
    for portion in getattr(entity, "portions", []):
        portion.id = uuid4()
    return entity


def test_mocked_food_meal_api(application, monkeypatch):
    user = prepare(application)
    repository = MagicMock()
    repository.save.side_effect = save
    monkeypatch.setattr(nutrition_module, "NutritionRepository", lambda session: repository)
    with TestClient(application) as client:
        created = client.post("/api/v1/foods/custom", json={"name": "Oats", "calories_kcal": 200})
        assert created.status_code == 201
        food = repository.save.call_args.args[0]
        assert food.created_by_user_id == user.id
        repository.foods.return_value = [food]
        assert client.get(f"/api/v1/foods/{food.id}").status_code == 200
        meal_response = client.post(
            "/api/v1/meals",
            json={
                "meal_type": "lunch",
                "items": [
                    {"food_id": str(food.id), "quantity_g": "25"},
                ],
            },
        )
        assert meal_response.status_code == 201
        assert Decimal(meal_response.json()["totals"]["calories_kcal"]) == 50
        meal = repository.save.call_args.args[0]
        assert meal.user_id == user.id
        repository.meal.return_value = meal
        assert (
            client.patch(f"/api/v1/meals/{meal.id}", json={"notes": "Updated"}).status_code == 200
        )
        repository.meals.return_value = [meal]
        repository.profile.return_value = None
        repository.goal_at.return_value = None
        assert client.get("/api/v1/meals").status_code == 200
        assert client.get("/api/v1/nutrition/daily?date=2026-01-01").status_code == 200
        assert client.get("/api/v1/nutrition/daily?date=9999-12-31").status_code == 422
        assert client.delete(f"/api/v1/meals/{meal.id}").status_code == 204


def test_mocked_profile_goal_weight_api(application, monkeypatch):
    user = prepare(application)
    repository = MagicMock()
    repository.save.side_effect = save
    monkeypatch.setattr(profiles_module, "ProfileRepository", lambda session: repository)
    repository.put_profile.side_effect = lambda user_id, values: save(
        UserProfile(user_id=user_id, **values)
    )
    with TestClient(application) as client:
        profile = client.put(
            "/api/v1/profile",
            json={
                "display_name": "Test",
                "height_cm": 175,
                "current_weight_kg": 70,
                "activity_level": "moderate",
                "timezone": "Asia/Kolkata",
            },
        )
        assert profile.status_code == 200
        assert profile.json()["user_id"] == str(user.id)
        assert profile.json()["timezone"] == "Asia/Kolkata"
        assert (
            client.put(
                "/api/v1/profile",
                json={
                    "display_name": "Test",
                    "height_cm": -1,
                    "current_weight_kg": 70,
                    "activity_level": "moderate",
                },
            ).status_code
            == 422
        )
        goal = client.post(
            "/api/v1/goals",
            json={
                "goal_type": "maintenance",
                "current_weight_kg": 97,
                "target_weight_kg": 85,
                "selected_deficit_kcal": 500,
            },
        )
        assert goal.status_code == 201
        entity = repository.save.call_args.args[0]
        assert entity.user_id == user.id
        repository.goal.return_value = entity
        assert (
            client.patch(f"/api/v1/goals/{entity.id}", json={"status": "paused"}).status_code == 200
        )
        repository.goals.return_value = [entity]
        assert client.get("/api/v1/goals").status_code == 200
        weight = client.post("/api/v1/weight-logs", json={"weight_kg": 70})
        assert weight.status_code == 201
        assert Decimal(weight.json()["weight_kg"]) == 70
        repository.weights.return_value = [repository.save.call_args.args[0]]
        assert client.get("/api/v1/weight-logs").status_code == 200
        assert client.post("/api/v1/weight-logs", json={"weight_kg": -1}).status_code == 422


def test_commit_failure_never_returns_success(application):
    prepare(application)
    session = application.state.database.session.return_value
    session.commit.side_effect = IntegrityError("secret-sql", {}, Exception("secret"))

    @application.post("/transaction")
    def transaction(session: DbSession):
        return {"success": True}

    with TestClient(application) as client:
        response = client.post("/transaction")
    assert response.status_code == 409
    assert "secret" not in response.text
    session.rollback.assert_called_once()
    session.close.assert_called_once()
