from datetime import UTC, date, datetime, timedelta
from email.utils import format_datetime
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import httpx
import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.integrations.foods import OpenFoodFactsProvider, ProviderError
from app.modules.common import day_bounds
from app.modules.nutrition.schemas import RecipeCreate
from app.modules.nutrition.service import NutritionService
from app.modules.profiles.schemas import WeightCreate
from app.modules.profiles.service import ProfileService


@pytest.mark.parametrize(
    "status,category,attempts",
    [
        (400, "invalid_request", 1),
        (404, "invalid_endpoint", 1),
        (403, "access_denied", 1),
        (429, "rate_limited", 3),
        (500, "provider_unavailable", 3),
        (503, "provider_unavailable", 3),
    ],
)
def test_provider_http_categories_and_bounded_retries(status, category, attempts, monkeypatch):
    calls, sleeps = [], []
    monkeypatch.setattr("app.integrations.foods.sleep", sleeps.append)

    def handler(request):
        calls.append(request)
        assert request.headers["Accept"] == "application/json"
        assert request.headers["User-Agent"].startswith("PROVIA/")
        return httpx.Response(status)

    provider = OpenFoodFactsProvider(Settings(_env_file=None), httpx.MockTransport(handler))
    with pytest.raises(ProviderError, match=category):
        provider.search("rice")
    assert len(calls) == attempts
    assert len(sleeps) == attempts - 1
    if sleeps:
        assert 6 <= sleeps[0] <= 6.5
        assert 12 <= sleeps[1] <= 12.5


@pytest.mark.parametrize(
    "error,category", [(httpx.ConnectError, "network_failure"), (httpx.ReadTimeout, "timeout")]
)
def test_network_failures_are_distinct(error, category):
    calls = []

    def handler(request):
        calls.append(request)
        raise error("secret URL must not escape", request=request)

    provider = OpenFoodFactsProvider(Settings(_env_file=None), httpx.MockTransport(handler))
    with pytest.raises(ProviderError) as caught:
        provider.search("rice")
    assert str(caught.value) == category
    assert len(calls) == 3


@pytest.mark.parametrize("retry_after", ["60", "http-date"])
def test_long_retry_after_defers_without_sleep(retry_after, monkeypatch):
    # Collection may precede this test by many minutes in the PostgreSQL suite.
    # Freeze the provider's wall clock so the header never expires while waiting.
    now = datetime(2026, 1, 1, tzinfo=UTC)

    class FixedClock(datetime):
        @classmethod
        def now(cls, tz=None):
            return now.astimezone(tz)

    monkeypatch.setattr("app.integrations.foods.datetime", FixedClock)
    if retry_after == "http-date":
        retry_after = format_datetime(now + timedelta(minutes=5))
    calls, sleeps = [], []
    monkeypatch.setattr("app.integrations.foods.sleep", sleeps.append)

    def handler(request):
        calls.append(request)
        return httpx.Response(503, headers={"Retry-After": retry_after})

    provider = OpenFoodFactsProvider(Settings(_env_file=None), httpx.MockTransport(handler))
    with pytest.raises(ProviderError, match="provider_unavailable"):
        provider.search("rice")
    with pytest.raises(ProviderError, match="rate_limited"):
        provider.search("oats")
    assert len(calls) == 1 and sleeps == []


def test_transient_retry_success_and_stale_fallback(monkeypatch):
    now = [100.0]
    monkeypatch.setattr("app.integrations.foods.monotonic", lambda: now[0])
    responses = [503, 200]

    def handler(request):
        status = responses.pop(0) if responses else 503
        return httpx.Response(
            status,
            json={
                "products": [
                    {
                        "code": "fixture",
                        "product_name": "Fixture",
                        "nutrition_data_per": "100g",
                        "product_quantity_unit": "g",
                        "nutriments": {},
                    }
                ]
            },
        )

    provider = OpenFoodFactsProvider(
        Settings(_env_file=None, food_provider_cache_seconds=10), httpx.MockTransport(handler)
    )
    assert len(provider.search("rice")) == 1
    now[0] = 200
    repository = MagicMock()
    repository.local_search.return_value = []
    repository.import_foods.return_value = [SimpleNamespace(id=uuid4())]
    result = NutritionService(repository).search(uuid4(), "rice", {"open_food_facts": provider})
    assert result["provider_status"] == {"open_food_facts": "cached"}
    assert len(result["items"]) == 1
    now[0] = 10000
    with pytest.raises(ProviderError) as caught:
        provider.search("rice")
    assert caught.value.cached_foods is None


def test_historical_service_uses_local_day_end():
    repository = MagicMock()
    repository.profile.return_value = SimpleNamespace(timezone="America/New_York")
    repository.meals.return_value = []
    repository.goal_at.return_value = None
    user = uuid4()
    NutritionService(repository).dashboard(user, date(2026, 3, 8))
    start, end = day_bounds(date(2026, 3, 8), "America/New_York")
    assert end - start == timedelta(hours=23)
    repository.goal_at.assert_called_once_with(user, end)


def test_weight_log_does_not_change_goal():
    repository = MagicMock()
    repository.save.side_effect = lambda value: value
    result = ProfileService(repository).add_weight(uuid4(), WeightCreate(weight_kg=90))
    assert result.weight_kg == 90
    repository.pause_active.assert_not_called()
    repository.record_transition.assert_not_called()
    repository.active_goal.assert_not_called()


@pytest.mark.parametrize(
    "changes",
    [
        {"yield_g": 0},
        {"yield_g": None},
        {"ingredients": []},
        {"portions": [{"label": "bowl", "grams": 500}]},
    ],
)
def test_recipe_invalid_yield_and_quantities(changes):
    data = {
        "name": "Fixture",
        "yield_g": 200,
        "ingredients": [{"food_id": uuid4(), "quantity_g": 100}],
    }
    with pytest.raises(ValidationError):
        RecipeCreate(**{**data, **changes})


def test_new_endpoints_require_auth(client):
    for path in [
        "/recipes",
        f"/weight-logs/{uuid4()}/goal-preview",
        f"/weight-logs/{uuid4()}/apply-goal",
    ]:
        assert client.post("/api/v1" + path).status_code == 401
    assert client.get(f"/api/v1/recipes/{uuid4()}").status_code == 401
