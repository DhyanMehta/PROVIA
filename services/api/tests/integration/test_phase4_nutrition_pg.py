"""MVP nutrition paths against the runner-owned disposable PostgreSQL database."""

from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models import MealLog, RequestReceipt
from app.integrations.foods import OpenFoodFactsProvider

pytestmark = pytest.mark.integration


def make_food(api, headers, name="Synthetic fixture"):
    response = api.post(
        "/api/v1/foods/custom",
        headers=headers,
        json={"name": name, "calories_kcal": "12.345", "protein_g": "0"},
    )
    assert response.status_code == 201
    return response.json()


def test_meal_replay_concurrency_conflict_ownership_and_deletion(authenticated_client, pg_engine):
    api, headers = authenticated_client
    own, other = headers(), headers("nutrition-b")
    food = make_food(api, own)
    key = str(uuid4())
    retry = {**own, "Idempotency-Key": key}
    # Omitted consumed_at must not change the request identity on retry.
    body = {"meal_type": "lunch", "items": [{"food_id": food["id"], "quantity_g": "33.333"}]}
    with ThreadPoolExecutor(max_workers=3) as executor:
        responses = list(
            executor.map(lambda _: api.post("/api/v1/meals", headers=retry, json=body), range(3))
        )
    assert all(response.status_code == 201 for response in responses)
    ids = {response.json()["id"] for response in responses}
    assert len(ids) == 1
    meal_id = ids.pop()
    assert Decimal(responses[0].json()["totals"]["calories_kcal"]) == Decimal("4.115")
    with Session(pg_engine) as session:
        assert session.scalar(select(func.count()).select_from(MealLog)) == 1
        assert session.scalar(select(func.count()).select_from(RequestReceipt)) == 1
    changed = {**body, "notes": "changed explicit request"}
    conflict = api.post("/api/v1/meals", headers=retry, json=changed)
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert api.get(f"/api/v1/meals/{meal_id}", headers=other).status_code == 404
    own_other_food = make_food(api, other)
    other_body = {**body, "items": [{"food_id": own_other_food["id"], "quantity_g": "33.333"}]}
    response = api.post("/api/v1/meals", headers={**other, "Idempotency-Key": key}, json=other_body)
    assert response.status_code == 201 and response.json()["id"] != meal_id
    assert api.delete(f"/api/v1/meals/{meal_id}", headers=own).status_code == 204
    deleted = api.post("/api/v1/meals", headers=retry, json=body)
    assert deleted.status_code == 409
    assert deleted.json()["error"]["code"] == "IDEMPOTENCY_RESOURCE_DELETED"


def test_paginated_foods_recipes_quantity_and_meal_ranges(authenticated_client):
    api, headers = authenticated_client
    own, other = headers(), headers("nutrition-b")
    foods = [make_food(api, own, "Synthetic " + str(index)) for index in range(3)]
    first = api.get("/api/v1/foods/search?q=Synthetic&source=local&page_size=2", headers=own)
    second = api.get(
        "/api/v1/foods/search?q=Synthetic&source=local&page=2&page_size=2", headers=own
    )
    assert first.status_code == second.status_code == 200
    assert len(first.json()["items"]) == 2 and len(second.json()["items"]) == 1
    assert {row["id"] for row in first.json()["items"]}.isdisjoint(
        {row["id"] for row in second.json()["items"]}
    )
    quantity = api.get(f"/api/v1/foods/{foods[0]['id']}/nutrition?quantity_g=33.333", headers=own)
    assert quantity.status_code == 200
    assert Decimal(quantity.json()["calories_kcal"]) == Decimal("4.115")
    assert quantity.json()["fiber_g"] is None
    assert (
        api.get(f"/api/v1/foods/{foods[0]['id']}/nutrition?quantity_g=1", headers=other).status_code
        == 404
    )
    assert (
        api.get(f"/api/v1/foods/{foods[0]['id']}/nutrition?quantity_g=0", headers=own).status_code
        == 422
    )
    recipe_ids = []
    for index in range(2):
        response = api.post(
            "/api/v1/recipes",
            headers=own,
            json={
                "name": f"Recipe {index}",
                "yield_g": "100",
                "ingredients": [{"food_id": foods[0]["id"], "quantity_g": "100"}],
            },
        )
        assert response.status_code == 201
        recipe_ids.append(response.json()["id"])
    recipe_page = api.get("/api/v1/recipes?limit=1&offset=1", headers=own)
    assert recipe_page.status_code == 200 and len(recipe_page.json()["items"]) == 1
    assert recipe_page.json()["items"][0]["id"] in recipe_ids
    assert api.get("/api/v1/recipes", headers=other).json()["items"] == []
    for timestamp in ("2026-03-07T12:00:00Z", "2026-03-08T12:00:00Z", "2026-03-09T12:00:00Z"):
        response = api.post(
            "/api/v1/meals",
            headers=own,
            json={
                "meal_type": "snack",
                "consumed_at": timestamp,
                "items": [{"food_id": foods[0]["id"], "quantity_g": "1"}],
            },
        )
        assert response.status_code == 201
    selected = api.get("/api/v1/meals?start_date=2026-03-07&end_date=2026-03-08", headers=own)
    assert selected.status_code == 200 and len(selected.json()["items"]) == 2
    assert (
        api.get(
            "/api/v1/meals?date=2026-03-07&start_date=2026-03-07&end_date=2026-03-08", headers=own
        ).status_code
        == 422
    )


def test_custom_food_and_recipe_retry_same_operation_scoped_key(authenticated_client):
    api, headers = authenticated_client
    retry = {**headers(), "Idempotency-Key": str(uuid4())}
    food_body = {"name": "Synthetic retry food", "calories_kcal": "20"}
    food = api.post("/api/v1/foods/custom", headers=retry, json=food_body)
    again = api.post("/api/v1/foods/custom", headers=retry, json=food_body)
    assert food.status_code == again.status_code == 201
    assert food.json()["id"] == again.json()["id"]
    recipe_body = {
        "name": "Synthetic retry recipe",
        "yield_g": "50",
        "ingredients": [{"food_id": food.json()["id"], "quantity_g": "50"}],
    }
    recipe = api.post("/api/v1/recipes", headers=retry, json=recipe_body)
    repeat = api.post("/api/v1/recipes", headers=retry, json=recipe_body)
    assert recipe.status_code == repeat.status_code == 201
    assert recipe.json()["id"] == repeat.json()["id"]
    assert (
        api.post(
            "/api/v1/recipes", headers=retry, json={**recipe_body, "yield_g": "51"}
        ).status_code
        == 409
    )


def test_barcode_import_uses_normalization_and_persisted_cache(
    authenticated_client, db_application
):
    api, headers = authenticated_client
    own = headers()
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(
            200,
            json={
                "status": 1,
                "product": {
                    "code": "1234567890123",
                    "product_name": "Synthetic barcode fixture",
                    "nutrition_data_per": "100g",
                    "product_quantity_unit": "g",
                    "nutriments": {"proteins_100g": 0},
                },
            },
        )

    provider = OpenFoodFactsProvider(Settings(_env_file=None), httpx.MockTransport(handler))
    db_application.state.food_providers["open_food_facts"] = provider
    first = api.get("/api/v1/foods/barcode/1234567890123", headers=own)
    assert first.status_code == 200
    UUID(first.json()["id"])
    assert first.json()["source"] == "open_food_facts" and first.json()["fiber_g"] is None
    second = api.get("/api/v1/foods/barcode/1234567890123", headers=own)
    assert second.status_code == 200 and second.json()["id"] == first.json()["id"]
    assert len(calls) == 1
    assert api.get("/api/v1/foods/barcode/not-a-barcode", headers=own).status_code == 422
