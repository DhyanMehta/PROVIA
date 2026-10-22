from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AwareDatetime, Field, field_validator, model_validator

from app.modules.common import Input, Nutrient, Output, Quantity, Weight


class PortionCreate(Input):
    label: Annotated[str, Field(min_length=1, max_length=100)]
    grams: Quantity


class PortionOut(PortionCreate, Output):
    id: UUID


class FoodCreate(Input):
    name: Annotated[str, Field(min_length=1, max_length=300)]
    brand: Annotated[str, Field(max_length=200)] | None = None
    calories_kcal: Nutrient | None = None
    protein_g: Nutrient | None = None
    carbs_g: Nutrient | None = None
    fat_g: Nutrient | None = None
    fiber_g: Nutrient | None = None
    portions: Annotated[list[PortionCreate], Field(max_length=30)] = Field(default_factory=list)

    @field_validator("portions")
    @classmethod
    def unique_labels(cls, value):
        if len({portion.label for portion in value}) != len(value):
            raise ValueError("Portion labels must be unique")
        return value


class FoodOut(Output):
    id: UUID
    name: str
    brand: str | None
    source: str
    source_food_id: str | None
    aliases: list[str] = Field(default_factory=list)
    source_url: str | None = None
    license_name: str | None = None
    serving_basis: Literal["100g"]
    calories_kcal: Decimal | None
    protein_g: Decimal | None
    carbs_g: Decimal | None
    fat_g: Decimal | None
    fiber_g: Decimal | None
    portions: list[PortionOut]


class SearchOut(Output):
    items: list[FoodOut]
    provider_status: dict[str, str]


class MealItemCreate(Input):
    food_id: UUID
    quantity_g: Quantity | None = None
    portion_id: UUID | None = None
    portion_count: Annotated[Decimal, Field(gt=0, le=1000, decimal_places=3)] | None = None

    @model_validator(mode="after")
    def quantity_mode(self):
        grams = self.quantity_g is not None
        portion = self.portion_id is not None and self.portion_count is not None
        if grams == portion or (grams and (self.portion_id or self.portion_count)):
            raise ValueError("Supply grams or a portion ID and count, exclusively")
        return self


class MealCreate(Input):
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"]
    consumed_at: AwareDatetime = Field(default_factory=lambda: datetime.now(UTC))
    notes: Annotated[str, Field(max_length=2000)] | None = None
    items: Annotated[list[MealItemCreate], Field(min_length=1, max_length=100)]

    @field_validator("consumed_at")
    @classmethod
    def utc_timestamp(cls, value):
        return value.astimezone(UTC)


class MealPatch(Input):
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"] | None = None
    consumed_at: AwareDatetime | None = None
    notes: Annotated[str, Field(max_length=2000)] | None = None
    items: Annotated[list[MealItemCreate], Field(min_length=1, max_length=100)] | None = None

    @model_validator(mode="after")
    def nonnull_updates(self):
        if any(
            name in self.model_fields_set and getattr(self, name) is None
            for name in ("meal_type", "consumed_at", "items")
        ):
            raise ValueError("Only notes can be cleared")
        if self.consumed_at:
            self.consumed_at = self.consumed_at.astimezone(UTC)
        return self


class Totals(Output):
    calories_kcal: Decimal | None
    protein_g: Decimal | None
    carbs_g: Decimal | None
    fat_g: Decimal | None
    fiber_g: Decimal | None


class MealItemOut(Output):
    id: UUID
    food_id: UUID
    quantity_g: Decimal
    calories_kcal_snapshot: Decimal | None
    protein_g_snapshot: Decimal | None
    carbs_g_snapshot: Decimal | None
    fat_g_snapshot: Decimal | None
    fiber_g_snapshot: Decimal | None


class MealOut(Output):
    id: UUID
    meal_type: str
    consumed_at: datetime
    notes: str | None
    items: list[MealItemOut]
    totals: Totals


class DailyOut(Output):
    date: date
    timezone: str
    totals: Totals
    targets: Totals | None
    meals: list[MealOut]


class MaintenanceInput(Input):
    current_weight_kg: Weight


class MaintenanceOut(Output):
    maintenance_calories: Decimal
    calculation_method: str
    is_estimate: bool = True


class GoalCalculationInput(MaintenanceInput):
    target_weight_kg: Weight
    deficit_kcal: Annotated[Decimal, Field(ge=0, le=24000, decimal_places=3)]


class GoalCalculationOut(Output):
    current_weight_kg_snapshot: Decimal
    target_weight_kg: Decimal
    selected_deficit_kcal: Decimal
    maintenance_calories: Decimal
    daily_calorie_target: Decimal
    protein_target_g: Decimal
    protein_target_kcal: Decimal
    carbs_target_g: Decimal
    carbs_target_kcal: Decimal
    fat_target_g: Decimal
    fat_target_kcal: Decimal
    fiber_target_g: Decimal
    calculation_method: str
    calculation_version: str
    is_estimate: bool = True


class CalorieBudget(Output):
    target: Decimal | None
    consumed: Decimal | None
    remaining: Decimal | None


class GramBudget(Output):
    target_g: Decimal | None
    consumed_g: Decimal | None
    remaining_g: Decimal | None


class MacroBudget(GramBudget):
    target_kcal: Decimal | None
    consumed_kcal: Decimal | None
    remaining_kcal: Decimal | None


class DashboardOut(Output):
    date: date
    timezone: str
    maintenance_calories: Decimal | None
    selected_deficit_kcal: Decimal | None
    daily_calorie_target: Decimal | None
    is_estimate: bool = True
    calculation_method: str | None
    calculation_version: str | None
    calories: CalorieBudget
    protein: MacroBudget
    carbs: MacroBudget
    fat: MacroBudget
    fiber: GramBudget
    meals: list[MealOut]
