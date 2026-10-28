"""Nutrition contract regressions; providers use synthetic, local HTTP transports."""

from datetime import UTC, date, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import httpx
import pytest

from app.core.config import Settings
from app.core.exceptions import AppError
from app.integrations.foods import OpenFoodFactsProvider, ProviderError, USDAProvider
from app.modules.nutrition.service import NutritionService


def provider_settings():
    return Settings(_env_file=None, food_provider_min_interval_seconds=0, usda_api_key="fixture")


def product(code="1234567890123"):
    return {
        "code": code,
        "product_name": "Synthetic fixture",
        "nutrition_data_per": "100g",
        "product_quantity_unit": "g",
        "nutriments": {"proteins_100g": 0, "energy-kcal_100g": 100},
    }


@pytest.mark.parametrize("kind", ["usda", "open_food_facts"])
def test_provider_pagination_is_sent_and_cached_per_page(kind):
    requests = []

    def handler(request):
        requests.append(request)
        if kind == "usda":
            assert request.url.params["pageNumber"] in {"1", "2"}
            assert request.url.params["pageSize"] == "3"
            return httpx.Response(200, json={"foods": []})
        assert request.url.params["page"] in {"1", "2"}
        assert request.url.params["page_size"] == "3"
        return httpx.Response(200, json={"products": []})

    cls = USDAProvider if kind == "usda" else OpenFoodFactsProvider
    provider = cls(provider_settings(), httpx.MockTransport(handler))
    assert provider.search("fixture", page=1, page_size=3) == []
    assert provider.search("fixture", page=2, page_size=3) == []
    assert provider.search("fixture", page=1, page_size=3) == []
    assert len(requests) == 2


def test_barcode_normalization_and_cache_are_separate_from_search():
    calls = []

    def handler(request):
        calls.append(request)
        assert request.url.path == "/api/v2/product/1234567890123"
        assert "nutriments" in request.url.params["fields"]
        return httpx.Response(200, json={"status": 1, "product": product()})

    provider = OpenFoodFactsProvider(provider_settings(), httpx.MockTransport(handler))
    food = provider.barcode("1234567890123")[0]
    assert food.protein_g == 0 and food.fiber_g is None
    assert food.source_food_id == "1234567890123"
    assert provider.barcode("1234567890123")[0] == food
    assert len(calls) == 1


@pytest.mark.parametrize("status,payload", [(404, {}), (200, {"status": 0})])
def test_missing_barcode_is_empty_without_retry(status, payload):
    provider = OpenFoodFactsProvider(
        provider_settings(), httpx.MockTransport(lambda _: httpx.Response(status, json=payload))
    )
    assert provider.barcode("1234567890123") == []


@pytest.mark.parametrize("value", ["123", "../1234567890", "１２３４５６７８", "123456789012345"])
def test_invalid_barcode_does_not_make_request(value):
    provider = OpenFoodFactsProvider(
        provider_settings(), httpx.MockTransport(lambda _: pytest.fail())
    )
    with pytest.raises(ProviderError, match="invalid_request"):
        provider.barcode(value)


def test_barcode_response_identity_and_shape_are_validated():
    provider = OpenFoodFactsProvider(
        provider_settings(),
        httpx.MockTransport(
            lambda _: httpx.Response(200, json={"status": 1, "product": product("87654321")})
        ),
    )
    with pytest.raises(ProviderError, match="invalid_response"):
        provider.barcode("1234567890123")


def test_slow_provider_does_not_queue_waiting_threads():
    provider = OpenFoodFactsProvider(
        provider_settings(), httpx.MockTransport(lambda _: pytest.fail())
    )
    provider._lock.acquire()
    try:
        with pytest.raises(ProviderError, match="rate_limited"):
            provider.search("fixture")
    finally:
        provider._lock.release()


def test_oversized_provider_json_is_rejected():
    provider = OpenFoodFactsProvider(
        provider_settings(),
        httpx.MockTransport(
            lambda _: httpx.Response(
                200, content=b'{"products":[],"padding":"' + b"x" * (2 * 1024 * 1024) + b'"}'
            )
        ),
    )
    with pytest.raises(ProviderError, match="invalid_response"):
        provider.search("fixture")


def test_provider_specific_search_excludes_other_local_sources_and_imports_after_fetch():
    repo = MagicMock()
    provider = MagicMock()
    imported = SimpleNamespace(id=uuid4())

    def fetch(*args, **kwargs):
        repo.import_foods.assert_not_called()
        return [product()]

    provider.search.side_effect = fetch
    repo.import_foods.return_value = [imported]
    result = NutritionService(repo).search(
        uuid4(), "fixture", {"usda": provider}, local_source="usda", page=2, page_size=3
    )
    repo.local_search.assert_not_called()
    provider.search.assert_called_once_with("fixture", page=2, page_size=3)
    assert result["items"] == [imported] and result["page"] == 2 and result["page_size"] == 3


def test_provider_failure_uses_only_selected_catalog_page():
    repo, provider = MagicMock(), MagicMock()
    provider.search.side_effect = ProviderError("timeout")
    row = SimpleNamespace(id=uuid4())
    repo.local_search.return_value = [row]
    result = NutritionService(repo).search(
        uuid4(), "fixture", {"usda": provider}, local_source="usda", page=3, page_size=4
    )
    assert result["items"] == [row] and result["provider_status"] == {"usda": "cached_catalog"}
    assert repo.local_search.call_args.args[-3:] == ("usda", 4, 8)


def test_quantity_preview_uses_logging_rounding_and_preserves_unknowns():
    repo = MagicMock()
    food_id = uuid4()
    repo.foods.return_value = [
        SimpleNamespace(
            id=food_id,
            calories_kcal=Decimal("12.345"),
            protein_g=Decimal(0),
            carbs_g=None,
            fat_g=None,
            fiber_g=None,
        )
    ]
    result = NutritionService(repo).quantity(uuid4(), food_id, Decimal("33.333"))
    assert result["calories_kcal"] == Decimal("4.115")
    assert result["protein_g"] == 0 and result["fiber_g"] is None


@pytest.mark.parametrize(
    "day,start,end",
    [
        (date(2026, 1, 1), date(2026, 1, 1), None),
        (None, date(2026, 1, 1), None),
        (None, date(2026, 1, 2), date(2026, 1, 1)),
        (None, date(2020, 1, 1), date(2026, 1, 1)),
    ],
)
def test_meal_date_filter_rejects_ambiguous_or_unbounded_ranges(day, start, end):
    with pytest.raises(AppError) as error:
        NutritionService(MagicMock()).list_meals(uuid4(), day, 20, 0, start, end)
    assert error.value.status_code == 422


def test_meal_date_range_includes_final_local_day_and_dst():
    repo = MagicMock()
    repo.profile.return_value = SimpleNamespace(timezone="America/New_York")
    user = uuid4()
    NutritionService(repo).list_meals(user, None, 10, 3, date(2026, 3, 7), date(2026, 3, 8))
    repo.meals.assert_called_once_with(
        user, datetime(2026, 3, 7, 5, tzinfo=UTC), datetime(2026, 3, 9, 4, tzinfo=UTC), 10, 3
    )


@pytest.mark.parametrize(
    "path",
    [
        "/recipes",
        "/foods/barcode/1234567890123",
        "/foods/" + str(uuid4()) + "/nutrition?quantity_g=10",
    ],
)
def test_new_nutrition_routes_require_auth(client, path):
    assert client.get("/api/v1" + path).status_code == 401
