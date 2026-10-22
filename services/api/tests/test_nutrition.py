from datetime import UTC, date, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import httpx
import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.exceptions import AppError
from app.db.models import Food, FoodPortion, MealLog
from app.integrations.foods import NUTRIENTS, OpenFoodFactsProvider, ProviderError, USDAProvider
from app.modules.common import day_bounds
from app.modules.nutrition.calculations import consumed, portion_grams, totals
from app.modules.nutrition.schemas import FoodCreate, MealCreate, MealItemCreate, MealPatch
from app.modules.nutrition.service import NutritionService


def test_usda_mock_normalization():
    def handler(request):
        assert request.url.params["api_key"] == "test-key"
        assert request.url.params["dataType"] == "Foundation"
        assert request.extensions["timeout"]["read"] == 5
        return httpx.Response(
            200,
            json={
                "foods": [
                    {
                        "fdcId": 123,
                        "description": "Oats",
                        "dataType": "Foundation",
                        "foodNutrients": [
                            {"nutrientId": 1008, "unitName": "KCAL", "value": 389},
                            {"nutrientId": 1003, "unitName": "G", "value": 16.9},
                        ],
                    }
                ]
            },
        )

    foods = USDAProvider(
        Settings(_env_file=None, usda_api_key="test-key"), httpx.MockTransport(handler)
    ).search("oats")
    assert foods[0].calories_kcal == Decimal("389.000")
    assert foods[0].protein_g == Decimal("16.900")
    assert foods[0].fiber_g is None
    assert foods[0].source == "usda"


@pytest.mark.parametrize(
    "entries,expected",
    [
        ([(1008, 100), (2047, 110), (2048, 120)], "120"),
        ([(2048, 120), (2047, 110), (1008, 100)], "120"),
        ([(1008, 100), (2047, 110)], "110"),
        ([(2048, -1), (2047, 110)], "110"),
        ([(1008, 100)], "100"),
        ([], None),
    ],
)
def test_usda_foundation_energy_precedence(entries, expected):
    food = USDAProvider.normalize(
        {
            "fdcId": 1,
            "description": "Synthetic fixture",
            "dataType": "Foundation",
            "foodNutrients": [
                {"nutrientId": key, "unitName": "KCAL", "value": value} for key, value in entries
            ],
        }
    )
    assert food.calories_kcal == (Decimal(expected) if expected is not None else None)


def test_off_mock_normalization_and_portion():
    response = {
        "products": [
            {
                "code": "123",
                "product_name": "Oats",
                "brands": "Test",
                "nutrition_data_per": "100g",
                "product_quantity_unit": "g",
                "serving_quantity_unit": "g",
                "serving_quantity": 30,
                "serving_size": "30g",
                "nutriments": {"energy-kj_100g": 418.4, "proteins_100g": 0},
            }
        ]
    }
    provider = OpenFoodFactsProvider(
        Settings(_env_file=None, food_provider_min_interval_seconds=0),
        httpx.MockTransport(lambda request: httpx.Response(200, json=response)),
    )
    food = provider.search("oats")[0]
    assert food.calories_kcal == Decimal("100.000")
    assert food.protein_g == 0
    assert food.fiber_g is None
    assert food.portions[0].grams == 30
    response["products"][0]["product_quantity_unit"] = "ml"
    assert provider.search("drink") == []


@pytest.mark.parametrize("serving_quantity,serving_size", [(100001, "large"), (30, "   ")])
def test_invalid_provider_portions_are_omitted(serving_quantity, serving_size):
    food = OpenFoodFactsProvider.normalize(
        {
            "code": "123",
            "product_name": "Oats",
            "nutrition_data_per": "100g",
            "product_quantity_unit": "g",
            "serving_quantity_unit": "g",
            "serving_quantity": serving_quantity,
            "serving_size": serving_size,
        }
    )
    assert food is not None
    assert food.portions == []


def test_search_partial_failure_and_all_failed():
    repository = MagicMock()
    repository.local_search.return_value = []
    imported = SimpleNamespace(id=uuid4())
    repository.import_foods.return_value = [imported]
    healthy, failed = MagicMock(), MagicMock()
    healthy.search.return_value = []
    failed.search.side_effect = ProviderError("not_configured")
    service = NutritionService(repository)
    response = service.search(uuid4(), "oats", {"usda": failed, "open_food_facts": healthy})
    assert response["items"] == [imported]
    assert response["provider_status"] == {"usda": "not_configured", "open_food_facts": "ok"}
    with pytest.raises(AppError) as error:
        service.search(uuid4(), "oats", {"usda": failed})
    assert error.value.status_code == 503


@pytest.mark.parametrize("failure", ["timeout", "http", "json", "shape"])
def test_provider_failures(failure):
    def handler(request):
        if failure == "timeout":
            raise httpx.ReadTimeout("secret-url", request=request)
        if failure == "http":
            return httpx.Response(503, text="secret-internal-error")
        if failure == "json":
            return httpx.Response(200, text="not json")
        return httpx.Response(200, json={"products": None})

    provider = OpenFoodFactsProvider(Settings(_env_file=None), httpx.MockTransport(handler))
    with pytest.raises(ProviderError) as error:
        provider.search("oats")
    assert "secret" not in str(error.value)


def test_decimal_calculations():
    assert consumed(Decimal("12.345"), Decimal("33.333")) == Decimal("4.115")
    assert consumed(None, Decimal(50)) is None
    assert portion_grams(Decimal("30"), Decimal("1.5")) == Decimal("45.000")
    with pytest.raises(ValueError):
        consumed(Decimal(10), Decimal(0))
    with pytest.raises(ValueError):
        portion_grams(Decimal(30), Decimal(-1))


def test_missing_values_totals():
    item = SimpleNamespace(**{name + "_snapshot": Decimal(1) for name in NUTRIENTS})
    item.fiber_g_snapshot = None
    assert totals([item, item])["calories_kcal"] == 2
    assert totals([item])["fiber_g"] is None
    assert totals([])["fiber_g"] == 0


def test_meal_items_snapshot_and_portions():
    user_id, food_id, portion_id = uuid4(), uuid4(), uuid4()
    food = Food(
        id=food_id,
        name="Test",
        source="custom",
        created_by_user_id=user_id,
        **dict.fromkeys(NUTRIENTS, Decimal("10")),
    )
    food.portions = [FoodPortion(id=portion_id, label="serving", grams=Decimal("30"))]
    repository = MagicMock()
    repository.foods.return_value = [food]
    service = NutritionService(repository)
    inputs = [
        MealItemCreate(food_id=food_id, quantity_g=50),
        MealItemCreate(food_id=food_id, portion_id=portion_id, portion_count=2),
    ]
    items = service.make_items(user_id, inputs)
    assert totals(items)["protein_g"] == 11
    food.protein_g = Decimal("99")
    assert totals(items)["protein_g"] == 11
    repository.foods.assert_called_once_with(user_id, {food_id})
    meal = MealLog(
        id=uuid4(), user_id=user_id, items=items, meal_type="lunch", consumed_at=datetime.now(UTC)
    )
    repository.meal.return_value = meal
    repository.save.side_effect = lambda item: item
    service.update_meal(user_id, meal.id, MealPatch(notes="changed"))
    assert totals(meal.items)["protein_g"] == 11
    service.update_meal(user_id, meal.id, MealPatch(items=[inputs[0]]))
    assert totals(meal.items)["protein_g"] == Decimal("49.500")


def test_meal_and_food_isolation():
    repository = MagicMock()
    repository.foods.return_value = []
    repository.meal.return_value = None
    service = NutritionService(repository)
    user_id, meal_id = uuid4(), uuid4()
    with pytest.raises(AppError) as error:
        service.delete_meal(user_id, meal_id)
    assert error.value.status_code == 404
    repository.meal.assert_called_once_with(user_id, meal_id, lock=True)
    repository.delete.assert_not_called()
    with pytest.raises(AppError):
        service.make_items(user_id, [MealItemCreate(food_id=uuid4(), quantity_g=100)])
    repository.save.assert_not_called()


def test_daily_timezone_and_totals():
    repository = MagicMock()
    repository.profile.return_value = SimpleNamespace(timezone="Asia/Kolkata")
    repository.meals.return_value = []
    repository.goal_at.return_value = None
    user_id = uuid4()
    summary = NutritionService(repository).daily(user_id, date(2026, 1, 1))
    repository.meals.assert_called_once_with(
        user_id,
        datetime(2025, 12, 31, 18, 30, tzinfo=UTC),
        datetime(2026, 1, 1, 18, 30, tzinfo=UTC),
    )
    assert summary["totals"]["calories_kcal"] == 0
    start, end = day_bounds(date(2026, 3, 8), "America/New_York")
    assert (end - start).total_seconds() == 23 * 3600


def test_invalid_nutrition_input():
    with pytest.raises(ValidationError):
        FoodCreate(name="Test", protein_g=-1)
    with pytest.raises(ValidationError):
        MealItemCreate(food_id=uuid4(), quantity_g=0)
    with pytest.raises(ValidationError):
        MealItemCreate(food_id=uuid4(), quantity_g=1, portion_id=uuid4(), portion_count=1)
    with pytest.raises(ValidationError):
        MealCreate(meal_type="lunch", items=[])
    with pytest.raises(ValidationError):
        MealPatch(items=None)


@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/foods/search?q=oats"),
        ("GET", f"/foods/{uuid4()}"),
        ("POST", "/foods/custom"),
        ("POST", "/meals"),
        ("GET", "/meals"),
        ("GET", f"/meals/{uuid4()}"),
        ("PATCH", f"/meals/{uuid4()}"),
        ("DELETE", f"/meals/{uuid4()}"),
        ("GET", "/nutrition/daily?date=2026-01-01"),
    ],
)
def test_nutrition_requires_auth(client, method, path):
    assert client.request(method, "/api/v1" + path).status_code == 401
