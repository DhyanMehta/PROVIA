from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import MealLog, User

pytestmark = pytest.mark.integration
PREFIX = "/api/v1"


def test_catalog_and_plan_retries_bind_parent(
    authenticated_client,
):
    api, headers = authenticated_client
    own = headers()
    keyed = {**own, "Idempotency-Key": str(uuid4())}
    exercise = {
        "name": "Measured movement",
        "muscle_group": "back",
        "equipment": "bodyweight",
        "category": "strength",
    }
    first = api.post(PREFIX + "/exercises/custom", headers=keyed, json=exercise)
    assert first.status_code == 201
    assert (
        api.post(PREFIX + "/exercises/custom", headers=keyed, json=exercise).json()["id"]
        == first.json()["id"]
    )
    assert (
        api.post(
            PREFIX + "/exercises/custom", headers=keyed, json={**exercise, "name": "Changed"}
        ).status_code
        == 409
    )
    # The same UUID is independently scoped by operation.
    plan = api.post(PREFIX + "/workout-plans", headers=keyed, json={"name": "Original"})
    assert plan.status_code == 201
    plan_id = plan.json()["id"]
    assert (
        api.post(PREFIX + "/workout-plans", headers=keyed, json={"name": "Original"}).json()["id"]
        == plan_id
    )
    other_plan = api.post(PREFIX + "/workout-plans", headers=own, json={"name": "Another"})
    assert other_plan.status_code == 201
    copied = api.post(PREFIX + f"/workout-plans/{plan_id}/duplicate", headers=keyed)
    assert copied.status_code == 201 and copied.json()["is_active"] is False
    copied_id = copied.json()["id"]
    assert (
        api.post(PREFIX + f"/workout-plans/{plan_id}/duplicate", headers=keyed).json()["id"]
        == copied_id
    )
    wrong_parent = api.post(
        PREFIX + f"/workout-plans/{other_plan.json()['id']}/duplicate", headers=keyed
    )
    assert wrong_parent.status_code == 409
    assert api.delete(PREFIX + f"/workout-plans/{copied_id}", headers=own).status_code == 204
    assert (
        api.post(PREFIX + f"/workout-plans/{plan_id}/duplicate", headers=keyed).status_code == 409
    )


def test_daily_nutrition_limit_never_silently_truncates_owned_history(
    authenticated_client, pg_engine
):
    api, headers = authenticated_client
    own, other = headers(), headers("other")
    # Synthetic legacy fixture in this runner-owned schema, never app records.
    with Session(pg_engine) as db, db.begin():
        user_id = db.scalar(select(User.id).where(User.auth_provider_subject == "user-a"))
        db.add_all(
            [
                MealLog(
                    user_id=user_id,
                    meal_type="snack",
                    consumed_at=datetime(2026, 1, 1, 12, tzinfo=UTC),
                )
                for _ in range(101)
            ]
        )
    response = api.get(PREFIX + "/nutrition/daily?date=2026-01-01", headers=own)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "ANALYTICS_LIMIT"
    assert (
        len(api.get(PREFIX + "/meals?date=2026-01-01&limit=100", headers=own).json()["items"])
        == 100
    )
    assert (
        len(
            api.get(PREFIX + "/meals?date=2026-01-01&limit=100&offset=100", headers=own).json()[
                "items"
            ]
        )
        == 1
    )
    assert api.get(PREFIX + "/nutrition/daily?date=2026-01-01", headers=other).status_code == 200
