from decimal import ROUND_HALF_UP, Decimal

from app.core.exceptions import AppError
from app.db.models import Food, FoodPortion, MealItem, MealLog, Recipe, RecipeIngredient
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

    def create_recipe(self, user_id, data):
        foods = {
            food.id: food
            for food in self.repository.foods(user_id, [row.food_id for row in data.ingredients])
        }
        ingredients = []
        for row in data.ingredients:
            food = foods.get(row.food_id)
            if food is None:
                raise AppError("RESOURCE_NOT_FOUND", "Ingredient food was not found", 404)
            values = {
                name + "_snapshot": (
                    getattr(food, name) * row.quantity_g / Decimal(100)
                    if getattr(food, name) is not None
                    else None
                )
                for name in NUTRIENTS
            }
            ingredients.append(
                RecipeIngredient(food_id=food.id, quantity_g=row.quantity_g, **values)
            )
        total = totals(ingredients)
        values = {
            name: (value / data.yield_g * Decimal(100) if value is not None else None)
            for name, value in total.items()
        }
        if any(value is not None and value > 1000000 for value in values.values()):
            raise AppError(
                "INVALID_RECIPE_YIELD",
                "Yield produces nutrition values outside the supported range",
                422,
            )
        values = {
            name: value.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
            if value is not None
            else None
            for name, value in values.items()
        }
        food = self.repository.save(
            Food(
                name=data.name,
                aliases=data.aliases,
                food_kind="recipe",
                source="custom",
                serving_basis="100g",
                created_by_user_id=user_id,
                portions=[FoodPortion(**portion.model_dump()) for portion in data.portions],
                **values,
            )
        )
        recipe = self.repository.save(
            Recipe(
                food_id=food.id,
                user_id=user_id,
                yield_g=data.yield_g,
                incomplete=any(value is None for value in values.values()),
                ingredients=ingredients,
            )
        )
        return self.recipe_output(recipe, food)

    def get_recipe(self, user_id, recipe_id):
        recipe = self.repository.recipe(user_id, recipe_id)
        if recipe is None:
            raise AppError("RESOURCE_NOT_FOUND", "Recipe was not found", 404)
        return self.recipe_output(recipe, self.food(user_id, recipe.food_id))

    def recipes(self, user_id, limit, offset):
        recipes = self.repository.recipes(user_id, limit, offset)
        foods = {
            food.id: food for food in self.repository.foods(user_id, [r.food_id for r in recipes])
        }
        return [self.recipe_output(recipe, foods[recipe.food_id]) for recipe in recipes]

    def quantity(self, user_id, food_id, quantity_g):
        food = self.food(user_id, food_id)
        return {
            "food_id": food.id,
            "quantity_g": quantity_g,
            **{name: consumed(getattr(food, name), quantity_g) for name in NUTRIENTS},
        }

    def barcode(self, user_id, barcode, provider):
        cached = self.repository.barcode(user_id, barcode)
        if cached is not None:
            return cached
        if provider is None:
            raise AppError("FOOD_PROVIDERS_UNAVAILABLE", "Barcode provider is unavailable", 503)
        try:
            foods = provider.barcode(barcode)
        except ProviderError:
            raise AppError(
                "FOOD_PROVIDERS_UNAVAILABLE", "Barcode provider is unavailable", 503
            ) from None
        if not foods:
            raise AppError("RESOURCE_NOT_FOUND", "No supported gram-based food was found", 404)
        return self.repository.import_foods(foods)[0]

    @staticmethod
    def recipe_output(recipe, food):
        return {
            "id": recipe.id,
            "food": food,
            "yield_g": recipe.yield_g,
            "incomplete": recipe.incomplete,
            "ingredients": recipe.ingredients,
            "created_at": recipe.created_at,
        }

    def search(self, user_id, query, providers, local_source=None, page=1, page_size=20):
        # Pages apply independently to local and each provider source, not a globally
        # ranked federation. Fetch external results before flushing imported rows.
        remote_only = local_source in {"usda", "open_food_facts"}
        items = {}
        if not remote_only:
            items = {
                food.id: food
                for food in self.repository.local_search(
                    user_id, query, local_source, page_size, (page - 1) * page_size
                )
            }
        statuses = {}
        pending = []
        for source, provider in providers.items():
            try:
                pending.extend(provider.search(query, page=page, page_size=page_size))
                statuses[source] = "ok"
            except ProviderError as exc:
                statuses[source] = "cached" if exc.cached_foods is not None else str(exc)
                if exc.cached_foods is not None:
                    pending.extend(exc.cached_foods)
                elif remote_only:
                    for food in self.repository.local_search(
                        user_id, query, local_source, page_size, (page - 1) * page_size
                    ):
                        items[food.id] = food
                    if items:
                        statuses[source] = "cached_catalog"
        # One bounded batch also deduplicates repeated provider identifiers.
        if pending or any(status in {"ok", "cached"} for status in statuses.values()):
            for food in self.repository.import_foods(pending):
                items[food.id] = food
        if (
            providers
            and all(
                status not in {"ok", "cached", "cached_catalog"} for status in statuses.values()
            )
            and not items
        ):
            raise AppError(
                "FOOD_PROVIDERS_UNAVAILABLE", "Food search providers are unavailable", 503
            )
        return {
            "items": list(items.values()),
            "provider_status": statuses,
            "page": page,
            "page_size": page_size,
        }

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

    def list_meals(self, user_id, day, limit, offset, start_date=None, end_date=None):
        if day is not None and (start_date is not None or end_date is not None):
            raise AppError("INVALID_DATE_RANGE", "Use date or a start/end date range", 422)
        if (start_date is None) != (end_date is None):
            raise AppError("INVALID_DATE_RANGE", "Supply both start_date and end_date", 422)
        timezone = self.timezone(user_id)
        start, end = day_bounds(day, timezone) if day else (None, None)
        if start_date is not None:
            if start_date > end_date or (end_date - start_date).days > 365:
                raise AppError(
                    "INVALID_DATE_RANGE", "Use an ordered range of at most 366 days", 422
                )
            start = day_bounds(start_date, timezone)[0]
            end = day_bounds(end_date, timezone)[1]
        return self.repository.meals(user_id, start, end, limit, offset)

    def day_data(self, user_id, day):
        timezone = self.timezone(user_id)
        start, end = day_bounds(day, timezone)
        # A daily response includes complete meals and their bounded item lists.
        # Reject excessive days explicitly instead of hydrating unbounded history
        # or returning a silently truncated total. Full history stays paginated.
        meals = self.repository.meals(user_id, start, end, limit=101)
        if len(meals) > 100:
            raise AppError(
                "ANALYTICS_LIMIT", "Too many meals for a daily summary; use paginated history", 422
            )
        goal = self.repository.goal_at(user_id, end)
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
        return self.dashboard_with_goal(user_id, day)[0]

    def dashboard_with_goal(self, user_id, day):
        """Resolve one historical goal for both displayed budgets and goal context."""
        summary, goal = self.day_data(user_id, day)
        targets = summary["targets"] or dict.fromkeys(NUTRIENTS)
        consumed_totals = summary["totals"]
        daily_target = targets["calories_kcal"]
        result = {
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
        return result, goal

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
