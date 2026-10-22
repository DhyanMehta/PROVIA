"""Validated import format; no licensed dataset or nutrition values are bundled."""

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

from pydantic import Field, HttpUrl, TypeAdapter, field_validator

from app.integrations.foods import NormalizedFood, NormalizedPortion
from app.modules.nutrition.schemas import FoodCreate


class CuratedRecord(FoodCreate):
    source_food_id: Annotated[str, Field(min_length=1, max_length=100)]
    source_url: Annotated[HttpUrl, Field(max_length=1000)]
    license_name: Annotated[str, Field(min_length=1, max_length=200)]
    aliases: Annotated[list[str], Field(max_length=30)] = Field(default_factory=list)

    @field_validator("aliases")
    @classmethod
    def clean_aliases(cls, values):
        if any(not value.strip() or len(value) > 100 for value in values):
            raise ValueError("Aliases must be nonempty and at most 100 characters")
        return sorted({value.strip().casefold() for value in values})

    def normalized(self) -> NormalizedFood:
        return NormalizedFood(
            **self.model_dump(exclude={"portions", "source_url"}),
            source="indian_curated",
            source_url=str(self.source_url),
            verified_at=datetime.now(UTC),
            portions=[NormalizedPortion(**portion.model_dump()) for portion in self.portions],
        )


def load_catalog(path: Path) -> list[NormalizedFood]:
    if path.stat().st_size > 5_000_000:
        raise ValueError("Catalog file exceeds 5 MB")
    records = TypeAdapter(list[CuratedRecord]).validate_python(json.loads(path.read_text("utf-8")))
    if len(records) > 5000 or len({row.source_food_id for row in records}) != len(records):
        raise ValueError("Use at most 5000 unique source IDs per file")
    identities = {
        (str(row.source_url), row.name.casefold(), (row.brand or "").casefold(), row.food_kind)
        for row in records
    }
    if len(identities) != len(records):
        raise ValueError("Duplicate name, brand, classification and source URL in catalog")
    return [record.normalized() for record in records]
