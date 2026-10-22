"""HTTP adapters: preserve unknown nutrients; accept only a known gram basis."""

from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from threading import Lock
from time import monotonic
from typing import Literal

import httpx
from pydantic import BaseModel, Field

from app.core.config import Settings

NUTRIENTS = ("calories_kcal", "protein_g", "carbs_g", "fat_g", "fiber_g")


class ProviderError(Exception):
    """Safe error category only; never wrap provider URLs or bodies."""


class NormalizedPortion(BaseModel):
    label: str
    grams: Decimal


class NormalizedFood(BaseModel):
    name: str
    brand: str | None = None
    source: Literal["usda", "open_food_facts", "indian_curated"]
    source_food_id: str
    serving_basis: Literal["100g"] = "100g"
    calories_kcal: Decimal | None = None
    protein_g: Decimal | None = None
    carbs_g: Decimal | None = None
    fat_g: Decimal | None = None
    fiber_g: Decimal | None = None
    portions: list[NormalizedPortion] = Field(default_factory=list)
    aliases: list[str] = Field(default_factory=list)
    source_url: str | None = None
    license_name: str | None = None
    verified_at: datetime | None = None


def nutrient(value) -> Decimal | None:
    try:
        number = Decimal(str(value))
        if not number.is_finite() or number < 0 or number > 1000000:
            return None
        return number.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError):
        return None


class FoodProvider:
    def __init__(self, settings: Settings, transport=None):
        self.settings = settings
        self.transport = transport
        self._cache = {}
        self._next_request_at = 0.0
        self._lock = Lock()

    def search(self, query: str) -> list[NormalizedFood]:
        key = query.strip().casefold()
        if not key:
            return []
        with self._lock:
            now = monotonic()
            cached = self._cache.get(key)
            if cached and cached[0] > now:
                return [food.model_copy(deep=True) for food in cached[1]]
            if now < self._next_request_at:
                raise ProviderError("rate_limited")
            self._next_request_at = now + self.settings.food_provider_min_interval_seconds
            result = self.fetch_search(query.strip())
            if len(self._cache) >= 128:
                self._cache.pop(next(iter(self._cache)))
            self._cache[key] = (now + self.settings.food_provider_cache_seconds, result)
            return [food.model_copy(deep=True) for food in result]

    def fetch(self, url: str, params: dict) -> dict:
        try:
            with httpx.Client(
                timeout=self.settings.food_http_timeout_seconds,
                transport=self.transport,
                follow_redirects=False,
                headers={"User-Agent": self.settings.off_user_agent},
            ) as client:
                response = client.get(url, params=params)
                if response.status_code == 429:
                    try:
                        delay = max(1, min(float(response.headers.get("Retry-After", "60")), 3600))
                    except ValueError:
                        delay = 60
                    self._next_request_at = monotonic() + delay
                    raise ProviderError("rate_limited")
                response.raise_for_status()
                data = response.json()
                if not isinstance(data, dict):
                    raise ValueError
                return data
        except (httpx.HTTPError, ValueError):
            raise ProviderError("provider_unavailable") from None


class USDAProvider(FoodProvider):
    def fetch_search(self, query: str) -> list[NormalizedFood]:
        key = self.settings.usda_api_key
        if not key or not key.get_secret_value():
            raise ProviderError("not_configured")
        data = self.fetch(
            "https://api.nal.usda.gov/fdc/v1/foods/search",
            {
                "api_key": key.get_secret_value(),
                "query": query,
                "pageSize": 10,
                "dataType": "Foundation",
            },
        )
        foods = data.get("foods")
        if not isinstance(foods, list):
            raise ProviderError("invalid_response")
        return [
            food for row in foods[:10] if isinstance(row, dict) and (food := self.normalize(row))
        ]

    @staticmethod
    def normalize(row: dict) -> NormalizedFood | None:
        # Branded records can be volume-based. Do not assume a liquid's density.
        if row.get("dataType") not in {"Foundation", "SR Legacy", "Survey (FNDDS)"}:
            return None
        if not row.get("fdcId") or not isinstance(row.get("description"), str):
            return None
        mapping = {
            1008: ("calories_kcal", "KCAL"),
            1003: ("protein_g", "G"),
            1005: ("carbs_g", "G"),
            1004: ("fat_g", "G"),
            1079: ("fiber_g", "G"),
        }
        values = {}
        entries = row.get("foodNutrients") or []
        if not isinstance(entries, list):
            return None
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            nutrient_id = entry.get("nutrientId")
            key = mapping.get(nutrient_id) if isinstance(nutrient_id, int) else None
            if key and str(entry.get("unitName", "")).upper() == key[1]:
                values[key[0]] = nutrient(entry.get("value"))
        return NormalizedFood(
            name=row["description"][:300],
            source="usda",
            source_food_id=str(row["fdcId"])[:100],
            **values,
        )


class OpenFoodFactsProvider(FoodProvider):
    def fetch_search(self, query: str) -> list[NormalizedFood]:
        # Legacy CGI supports free text; v2 search is a structured filter API.
        data = self.fetch(
            "https://world.openfoodfacts.org/cgi/search.pl",
            {
                "search_terms": query,
                "search_simple": 1,
                "action": "process",
                "json": 1,
                "page_size": 10,
                "fields": "code,product_name,brands,nutriments,nutrition_data_per,"
                "product_quantity_unit,serving_quantity_unit,serving_quantity,serving_size",
            },
        )
        products = data.get("products")
        if not isinstance(products, list):
            raise ProviderError("invalid_response")
        return [
            food for row in products[:10] if isinstance(row, dict) and (food := self.normalize(row))
        ]

    @staticmethod
    def normalize(row: dict) -> NormalizedFood | None:
        units = {
            str(row.get(name, "")).lower()
            for name in ("product_quantity_unit", "serving_quantity_unit")
        }
        if row.get("nutrition_data_per") != "100g" or "g" not in units or units & {"ml", "cl", "l"}:
            return None
        if not row.get("code") or not isinstance(row.get("product_name"), str):
            return None
        raw = row.get("nutriments") or {}
        if not isinstance(raw, dict):
            return None
        mapping = {
            "calories_kcal": "energy-kcal_100g",
            "protein_g": "proteins_100g",
            "carbs_g": "carbohydrates_100g",
            "fat_g": "fat_100g",
            "fiber_g": "fiber_100g",
        }
        values = {name: nutrient(raw.get(key)) for name, key in mapping.items()}
        if (
            values["calories_kcal"] is None
            and (kj := nutrient(raw.get("energy-kj_100g"))) is not None
        ):
            values["calories_kcal"] = nutrient(kj / Decimal("4.184"))
        portions = []
        grams = nutrient(row.get("serving_quantity"))
        label = str(row.get("serving_size") or "serving").strip()[:100]
        if (
            row.get("serving_quantity_unit") == "g"
            and grams is not None
            and 0 < grams <= 100000
            and label
        ):
            portions.append(NormalizedPortion(label=label, grams=grams))
        brand = row.get("brands")
        return NormalizedFood(
            name=row["product_name"][:300],
            source="open_food_facts",
            source_food_id=str(row["code"])[:100],
            brand=brand[:200] if isinstance(brand, str) else None,
            portions=portions,
            **values,
        )
