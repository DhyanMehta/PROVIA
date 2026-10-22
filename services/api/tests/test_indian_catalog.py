import json

import httpx
import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.integrations.foods import OpenFoodFactsProvider, ProviderError
from app.integrations.indian_catalog import CuratedRecord, load_catalog


def test_curated_import_keeps_unknowns_and_aliases(tmp_path):
    # Synthetic metadata-only test record, never a real nutrition seed.
    path = tmp_path / "foods.json"
    path.write_text(
        json.dumps(
            [
                {
                    "name": "Test roti",
                    "source_food_id": "test-1",
                    "source_url": "https://example.org/test-fixture",
                    "license_name": "synthetic test",
                    "aliases": ["Chapati", "chapati"],
                    "portions": [],
                }
            ]
        )
    )
    food = load_catalog(path)[0]
    assert food.source == "indian_curated"
    assert food.aliases == ["chapati"]
    assert food.calories_kcal is None
    assert food.verified_at is not None


def test_curated_attribution_required():
    with pytest.raises(ValidationError):
        CuratedRecord(name="Roti", source_food_id="1")


def test_curated_duplicate_identity_rejected(tmp_path):
    path = tmp_path / "foods.json"
    record = {
        "name": "Test",
        "source_food_id": "one",
        "source_url": "https://example.com/test",
        "license_name": "synthetic fixture",
        "food_kind": "ingredient",
    }
    path.write_text(json.dumps([record, {**record, "source_food_id": "two"}]))
    with pytest.raises(ValueError, match="Duplicate"):
        load_catalog(path)


def test_provider_cache_and_rate_limit():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={"products": []})

    provider = OpenFoodFactsProvider(Settings(_env_file=None), httpx.MockTransport(handler))
    assert provider.search("paneer") == []
    assert provider.search(" PANEER ") == []
    assert len(calls) == 1
    with pytest.raises(ProviderError, match="rate_limited"):
        provider.search("roti")


def test_provider_respects_retry_after():
    provider = OpenFoodFactsProvider(
        Settings(_env_file=None),
        httpx.MockTransport(lambda request: httpx.Response(429, headers={"Retry-After": "60"})),
    )
    with pytest.raises(ProviderError, match="rate_limited"):
        provider.search("paneer")
    with pytest.raises(ProviderError, match="rate_limited"):
        provider.search("roti")
