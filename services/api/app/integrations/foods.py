"""HTTP adapters: preserve unknown nutrients; accept only a known gram basis."""

import json
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from email.utils import parsedate_to_datetime
from random import uniform
from threading import Lock
from time import monotonic, sleep
from typing import Literal
from urllib.parse import quote

import httpx
from pydantic import BaseModel, Field

from app.core.config import Settings

NUTRIENTS = ("calories_kcal", "protein_g", "carbs_g", "fat_g", "fiber_g")


class ProviderError(Exception):
    """Safe category plus optional bounded stale results; no provider bodies/URLs."""

    def __init__(self, code, cached_foods=None):
        super().__init__(code)
        self.cached_foods = cached_foods


class NormalizedPortion(BaseModel):
    label: str
    grams: Decimal


class NormalizedFood(BaseModel):
    name: str
    food_kind: str = "unspecified"
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
    max_attempts = 1

    def __init__(self, settings: Settings, transport=None):
        self.settings = settings
        self.transport = transport
        self._cache = {}
        self._next_request_at = 0.0
        self._lock = Lock()

    def search(self, query: str, page=1, page_size=20) -> list[NormalizedFood]:
        text = query.strip().casefold()
        if not text:
            return []
        if not 1 <= page <= 1000 or not 1 <= page_size <= 100:
            raise ProviderError("invalid_request")
        key = ("search", text, page, page_size)
        return self._cached(key, lambda: self.fetch_search(query.strip(), page, page_size))

    def _cached(self, key, fetch):
        now = monotonic()
        cached = self._cache.get(key)
        if cached and cached[0] > now:
            return [food.model_copy(deep=True) for food in cached[1]]
        # A slow provider must not queue unbounded request threads behind its
        # retry lock. Cached results remain usable while one request refreshes.
        if not self._lock.acquire(blocking=False):
            stale = (
                [food.model_copy(deep=True) for food in cached[1]]
                if cached and now <= cached[0] + self.settings.food_provider_stale_seconds
                else None
            )
            raise ProviderError("rate_limited", stale)
        try:
            now = monotonic()
            cached = self._cache.get(key)
            if cached and cached[0] > now:
                return [food.model_copy(deep=True) for food in cached[1]]
            try:
                if now < self._next_request_at:
                    raise ProviderError("rate_limited")
                self._next_request_at = now + self.settings.food_provider_min_interval_seconds
                result = fetch()
            except ProviderError as error:
                if (
                    cached
                    and now <= cached[0] + self.settings.food_provider_stale_seconds
                    and str(error)
                    in {"rate_limited", "provider_unavailable", "network_failure", "timeout"}
                ):
                    raise ProviderError(
                        str(error), [food.model_copy(deep=True) for food in cached[1]]
                    ) from None
                raise
            if len(self._cache) >= 128:
                self._cache.pop(next(iter(self._cache)))
            self._cache[key] = (now + self.settings.food_provider_cache_seconds, result)
            return [food.model_copy(deep=True) for food in result]
        finally:
            self._lock.release()

    @staticmethod
    def read_json(response):
        body = bytearray()
        for chunk in response.iter_bytes(chunk_size=65536):
            body.extend(chunk)
            if len(body) > 2 * 1024 * 1024:
                raise ProviderError("invalid_response")
        try:
            data = json.loads(body)
        except (ValueError, UnicodeError, RecursionError):
            raise ProviderError("invalid_response") from None
        if not isinstance(data, dict):
            raise ProviderError("invalid_response")
        # Limit structural complexity even on decoders that accept deep nesting.
        # Iterator frames keep traversal memory proportional to depth, not width.
        stack = [iter([data])]
        while stack:
            try:
                node = next(stack[-1])
            except StopIteration:
                stack.pop()
                continue
            if isinstance(node, (dict, list)):
                if len(stack) > 64:
                    raise ProviderError("invalid_response")
                stack.append(iter(node.values() if isinstance(node, dict) else node))
        return data

    @staticmethod
    def retry_after(value):
        if not value:
            return None
        try:
            delay = float(value)
            if not Decimal(str(delay)).is_finite():
                return None
            return max(0, delay)
        except ValueError:
            try:
                when = parsedate_to_datetime(value)
                if when.tzinfo is None:
                    when = when.replace(tzinfo=UTC)
                return max(0, (when - datetime.now(UTC)).total_seconds())
            except (TypeError, ValueError, OverflowError):
                return None

    def fetch(self, url: str, params: dict, *, product_lookup=False) -> dict:
        with httpx.Client(
            timeout=httpx.Timeout(
                self.settings.food_http_timeout_seconds,
                connect=min(5, self.settings.food_http_timeout_seconds),
            ),
            transport=self.transport,
            follow_redirects=False,
            headers={"User-Agent": self.settings.off_user_agent, "Accept": "application/json"},
        ) as client:
            for attempt in range(self.max_attempts):
                retry_delay = None
                try:
                    self._next_request_at = max(
                        self._next_request_at,
                        monotonic() + self.settings.food_provider_min_interval_seconds,
                    )
                    with client.stream("GET", url, params=params) as response:
                        status = response.status_code
                        if product_lookup and status == 404:
                            return {"status": 0}
                        if status == 429 or status >= 500:
                            category = "rate_limited" if status == 429 else "provider_unavailable"
                            retry_delay = self.retry_after(response.headers.get("Retry-After"))
                        elif status >= 300:
                            category = (
                                "invalid_endpoint"
                                if status in {301, 302, 307, 308, 404, 410}
                                else "invalid_request"
                            )
                            if status in {401, 403}:
                                category = "access_denied"
                            raise ProviderError(category)
                        else:
                            return self.read_json(response)
                except httpx.TimeoutException:
                    category = "timeout"
                except httpx.RequestError:
                    category = "network_failure"
                # Space attempts at least six seconds apart; bounded 6/12s backoff
                # plus jitter, never sleep for a long Retry-After inside a request.
                delay = max(6 * (2**attempt) + uniform(0, 0.5), retry_delay or 0)
                self._next_request_at = max(self._next_request_at, monotonic() + delay)
                if attempt + 1 == self.max_attempts or delay > 13:
                    raise ProviderError(category)
                sleep(delay)
        raise ProviderError("provider_unavailable")


class USDAProvider(FoodProvider):
    def fetch_search(self, query: str, page=1, page_size=10) -> list[NormalizedFood]:
        key = self.settings.usda_api_key
        if not key or not key.get_secret_value():
            raise ProviderError("not_configured")
        data = self.fetch(
            "https://api.nal.usda.gov/fdc/v1/foods/search",
            {
                "api_key": key.get_secret_value(),
                "query": query,
                "pageSize": page_size,
                "pageNumber": page,
                "dataType": "Foundation",
            },
        )
        foods = data.get("foods")
        if not isinstance(foods, list):
            raise ProviderError("invalid_response")
        return [
            food
            for row in foods[:page_size]
            if isinstance(row, dict) and (food := self.normalize(row))
        ]

    @staticmethod
    def normalize(row: dict) -> NormalizedFood | None:
        # Branded records can be volume-based. Do not assume a liquid's density.
        if not isinstance(row.get("dataType"), str) or row["dataType"] not in {
            "Foundation",
            "SR Legacy",
            "Survey (FNDDS)",
        }:
            return None
        if (
            not row.get("fdcId")
            or not isinstance(row.get("description"), str)
            or not row["description"].strip()
        ):
            return None
        mapping = {
            1008: ("calories_kcal", "KCAL"),
            1003: ("protein_g", "G"),
            1005: ("carbs_g", "G"),
            1004: ("fat_g", "G"),
            1079: ("fiber_g", "G"),
        }
        values = {}
        energies = {}
        entries = row.get("foodNutrients") or []
        if not isinstance(entries, list):
            return None
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            nutrient_id = entry.get("nutrientId")
            if (
                isinstance(nutrient_id, int)
                and nutrient_id in {1008, 2047, 2048}
                and str(entry.get("unitName", "")).upper() == "KCAL"
            ):
                value = nutrient(entry.get("value"))
                if value is not None:
                    energies[nutrient_id] = value
            key = mapping.get(nutrient_id) if isinstance(nutrient_id, int) else None
            if key and str(entry.get("unitName", "")).upper() == key[1]:
                values[key[0]] = nutrient(entry.get("value"))
        # Foundation uses Atwater energy IDs. Prefer specific factors, then general,
        # then legacy energy; never add multiple alternative estimates together.
        values["calories_kcal"] = next(
            (energies[key] for key in (2048, 2047, 1008) if key in energies), None
        )
        return NormalizedFood(
            name=row["description"][:300],
            source="usda",
            source_food_id=str(row["fdcId"])[:100],
            source_url="https://fdc.nal.usda.gov/",
            license_name="CC0 1.0",
            **values,
        )


class OpenFoodFactsProvider(FoodProvider):
    max_attempts = 3
    fields = (
        "code,product_name,brands,nutriments,nutrition_data_per,"
        "product_quantity_unit,serving_quantity_unit,serving_quantity,serving_size"
    )

    def fetch_search(self, query: str, page=1, page_size=10) -> list[NormalizedFood]:
        # Legacy CGI supports free text; v2 search is a structured filter API.
        data = self.fetch(
            "https://world.openfoodfacts.org/cgi/search.pl",
            {
                "search_terms": query,
                "search_simple": 1,
                "action": "process",
                "json": 1,
                "page_size": page_size,
                "page": page,
                "fields": self.fields,
            },
        )
        products = data.get("products")
        if not isinstance(products, list):
            raise ProviderError("invalid_response")
        return [
            food
            for row in products[:page_size]
            if isinstance(row, dict) and (food := self.normalize(row))
        ]

    def barcode(self, barcode: str) -> list[NormalizedFood]:
        if not barcode.isascii() or not barcode.isdigit() or not 8 <= len(barcode) <= 14:
            raise ProviderError("invalid_request")
        return self._cached(("barcode", barcode), lambda: self.fetch_barcode(barcode))

    def fetch_barcode(self, barcode):
        # Fixed provider origin and numeric path only; no user-controlled URLs.
        data = self.fetch(
            "https://world.openfoodfacts.org/api/v2/product/" + barcode,
            {"fields": self.fields},
            product_lookup=True,
        )
        if data.get("status") == 0:
            return []
        row = data.get("product")
        if data.get("status") != 1 or not isinstance(row, dict):
            raise ProviderError("invalid_response")
        if str(row.get("code")) != barcode:
            raise ProviderError("invalid_response")
        food = self.normalize(row)
        return [food] if food is not None else []

    @staticmethod
    def normalize(row: dict) -> NormalizedFood | None:
        units = {
            str(row.get(name, "")).lower()
            for name in ("product_quantity_unit", "serving_quantity_unit")
        }
        if row.get("nutrition_data_per") != "100g" or "g" not in units or units & {"ml", "cl", "l"}:
            return None
        if (
            not row.get("code")
            or not isinstance(row.get("product_name"), str)
            or not row["product_name"].strip()
        ):
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
            source_url="https://world.openfoodfacts.org/product/"
            + quote(str(row["code"])[:100], safe=""),
            license_name="Open Database License (ODbL)",
            brand=brand[:200] if isinstance(brand, str) else None,
            portions=portions,
            **values,
        )
