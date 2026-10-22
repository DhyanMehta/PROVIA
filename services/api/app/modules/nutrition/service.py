from app.core.exceptions import AppError
from app.db.models import Food, FoodPortion, MealItem, MealLog
from app.integrations.foods import NUTRIENTS, ProviderError
from app.modules.common import day_bounds
from app.modules.nutrition.calculations import (
    consumed,
    macro_budget,
    portion_grams,
    remaining,
    totals,
)
from app.modules.nutrition.schemas import MealOut


class NutritionService:
    def __init__(self, repository):
        self.repository = repository

    def food(self, user_id, food_id):
        foods = self.repository.foods(user_id, [food_id])
        if not foods:
            raise AppError("RESOURCE_NOT_FOUND", "Food was not found", 404)
        return foods[0]

    def custom_food(self, user_id, data):
        food = Food(
            **data.model_dump(exclude={"portions"}),
            source="custom",
            serving_basis="100g",
            created_by_user_id=user_id,
        )
        food.portions = [FoodPortion(**portion.model_dump()) for portion in data.portions]
        return self.repository.save(food)

    def search(self, user_id, query, providers, local_source=None):
        items = {
            food.id: food for food in self.repository.local_search(user_id, query, local_source)
        }
        statuses = {}
        for source, provider in providers.items():
            try:
                for food in self.repository.import_foods(provider.search(query)):
                    items[food.id] = food
                statuses[source] = "ok"
            except ProviderError as exc:
                statuses[source] = str(exc)
        if providers and all(status != "ok" for status in statuses.values()) and not items:
            raise AppError(
                "FOOD_PROVIDERS_UNAVAILABLE", "Food search providers are unavailable", 503
            )
        return {"items": list(items.values()), "provider_status": statuses}

    def make_items(self, user_id, inputs):
        foods = {
            food.id: food
            for food in self.repository.foods(user_id, {item.food_id for item in inputs})
        }
        result = []
        for item in inputs:
            food = foods.get(item.food_id)
            if food is None:
                raise AppError("RESOURCE_NOT_FOUND", "Food was not found", 404)
            quantity = item.quantity_g
            if quantity is None:
                portion = next((p for p in food.portions if p.id == item.portion_id), None)
                if portion is None:
                    raise AppError("RESOURCE_NOT_FOUND", "Food portion was not found", 404)
                try:
                    quantity = portion_grams(portion.grams, item.portion_count)
                except ValueError:
                    raise AppError(
                        "INVALID_QUANTITY", "Portion quantity is out of range", 422
                    ) from None
            snapshots = {
                name + "_snapshot": consumed(getattr(food, name), quantity) for name in NUTRIENTS
            }
            result.append(MealItem(food_id=food.id, quantity_g=quantity, **snapshots))
        return result

    def create_meal(self, user_id, data):
        items = self.make_items(user_id, data.items)
        meal = MealLog(user_id=user_id, **data.model_dump(exclude={"items"}), items=items)
        return self.repository.save(meal)

    def get_meal(self, user_id, meal_id, lock=False):
        meal = self.repository.meal(user_id, meal_id, lock=lock)
        if meal is None:
            raise AppError("RESOURCE_NOT_FOUND", "Meal was not found", 404)
        return meal

    def update_meal(self, user_id, meal_id, data):
        meal = self.get_meal(user_id, meal_id, lock=True)
        # A notes/time-only update preserves all historical nutrient snapshots.
        if data.items is not None:
            meal.items = self.make_items(user_id, data.items)
        for key, value in data.model_dump(exclude_unset=True, exclude={"items"}).items():
            setattr(meal, key, value)
        return self.repository.save(meal)

    def delete_meal(self, user_id, meal_id):
        self.repository.delete(self.get_meal(user_id, meal_id, lock=True))

    def timezone(self, user_id):
        profile = self.repository.profile(user_id)
        return profile.timezone if profile else "UTC"

    def list_meals(self, user_id, day, limit, offset):
        start, end = day_bounds(day, self.timezone(user_id)) if day else (None, None)
        return self.repository.meals(user_id, start, end, limit, offset)

    def day_data(self, user_id, day):
        timezone = self.timezone(user_id)
        start, end = day_bounds(day, timezone)
        meals = self.repository.meals(user_id, start, end)
        goal = self.repository.active_goal(user_id)
        targets = None
        if goal:
            targets = {
                "calories_kcal": goal.daily_calorie_target,
                "protein_g": goal.protein_target_g,
                "carbs_g": goal.carbs_target_g,
                "fat_g": goal.fat_target_g,
                "fiber_g": goal.fiber_target_g,
            }
        return {
            "date": day,
            "timezone": timezone,
            "targets": targets,
            "totals": totals([item for meal in meals for item in meal.items]),
            "meals": [self.output(meal) for meal in meals],
        }, goal

    def daily(self, user_id, day):
        summary, _ = self.day_data(user_id, day)
        return summary

    def dashboard(self, user_id, day):
        summary, goal = self.day_data(user_id, day)
        targets = summary["targets"] or dict.fromkeys(NUTRIENTS)
        consumed_totals = summary["totals"]
        daily_target = targets["calories_kcal"]
        return {
            "date": day,
            "timezone": summary["timezone"],
            "meals": summary["meals"],
            "maintenance_calories": goal.maintenance_calories if goal else None,
            "selected_deficit_kcal": goal.selected_deficit_kcal if goal else None,
            "daily_calorie_target": daily_target,
            "calculation_method": goal.calculation_method if goal else None,
            "calculation_version": goal.calculation_version if goal else None,
            "calories": {
                "target": daily_target,
                "consumed": consumed_totals["calories_kcal"],
                "remaining": remaining(daily_target, consumed_totals["calories_kcal"]),
            },
            "protein": macro_budget(targets["protein_g"], consumed_totals["protein_g"], 4),
            "carbs": macro_budget(targets["carbs_g"], consumed_totals["carbs_g"], 4),
            "fat": macro_budget(targets["fat_g"], consumed_totals["fat_g"], 9),
            "fiber": macro_budget(targets["fiber_g"], consumed_totals["fiber_g"], None),
        }

    @staticmethod
    def output(meal):
        return MealOut(
            id=meal.id,
            meal_type=meal.meal_type,
            consumed_at=meal.consumed_at,
            notes=meal.notes,
            items=meal.items,
            totals=totals(meal.items),
        )
