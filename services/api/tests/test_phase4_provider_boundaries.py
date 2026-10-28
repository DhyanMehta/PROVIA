from datetime import date
from unittest.mock import MagicMock
from uuid import uuid4

import httpx
import pytest

from app.core.config import Settings
from app.core.exceptions import AppError
from app.integrations.foods import ProviderError, USDAProvider
from app.modules.nutrition.service import NutritionService


@pytest.mark.parametrize("data_type", [[], {}, 1, None])
def test_untrusted_usda_data_type_does_not_escape_normalization(data_type):
    provider = USDAProvider(
        Settings(_env_file=None, usda_api_key="synthetic-test-key"),
        httpx.MockTransport(
            lambda request: httpx.Response(
                200, json={"foods": [{"dataType": data_type, "fdcId": 1, "description": "Fixture"}]}
            )
        ),
    )
    assert provider.search("fixture") == []


def test_deeply_nested_provider_json_is_a_sanitized_provider_failure():
    depth = 100
    body = b'{"foods":' + b"[" * depth + b"0" + b"]" * depth + b"}"
    provider = USDAProvider(
        Settings(_env_file=None, usda_api_key="synthetic-test-key"),
        httpx.MockTransport(lambda request: httpx.Response(200, content=body)),
    )
    with pytest.raises(ProviderError) as caught:
        provider.search("fixture")
    assert str(caught.value) == "invalid_response"


def test_parser_recursion_failure_is_sanitized(monkeypatch):
    provider = USDAProvider(
        Settings(_env_file=None, usda_api_key="synthetic-test-key"),
        httpx.MockTransport(lambda request: httpx.Response(200, content=b'{"foods":[]}')),
    )

    def fail_parser(*args, **kwargs):
        raise RecursionError("private parser details")

    monkeypatch.setattr("app.integrations.foods.json.loads", fail_parser)
    with pytest.raises(ProviderError) as caught:
        provider.search("fixture")
    assert str(caught.value) == "invalid_response"


def test_daily_nutrition_rejects_excessive_records_before_building_partial_totals():
    repository = MagicMock()
    repository.profile.return_value = None
    repository.meals.return_value = [object()] * 101
    with pytest.raises(AppError) as caught:
        NutritionService(repository).daily(uuid4(), date(2026, 1, 1))
    assert caught.value.code == "ANALYTICS_LIMIT" and caught.value.status_code == 422
    assert repository.meals.call_args.kwargs["limit"] == 101
    repository.goal_at.assert_not_called()
