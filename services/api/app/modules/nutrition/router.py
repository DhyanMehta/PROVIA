from datetime import date
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Path, Query, Request, Response

from app.core.auth import CurrentUser
from app.db.dependencies import DbSession
from app.modules.common import Limit, Offset, Page
from app.modules.idempotency import IdempotencyKey, create_once
from app.modules.nutrition.repository import NutritionRepository
from app.modules.nutrition.schemas import (
    DailyOut,
    DashboardOut,
    FoodCreate,
    FoodOut,
    FoodQuantityOut,
    GoalCalculationInput,
    GoalCalculationOut,
    MaintenanceInput,
    MaintenanceOut,
    MealCreate,
    MealOut,
    MealPatch,
    RecipeCreate,
    RecipeOut,
    SearchOut,
)
from app.modules.nutrition.service import NutritionService
from app.modules.nutrition.targets import METHOD, calculate_targets, maintenance

router = APIRouter(tags=["nutrition"])


@router.get("/recipes", response_model=Page[RecipeOut])
def recipes(user: CurrentUser, session: DbSession, limit: Limit = 20, offset: Offset = 0):
    return {
        "items": NutritionService(NutritionRepository(session)).recipes(user.id, limit, offset),
        "limit": limit,
        "offset": offset,
    }


@router.post("/recipes", response_model=RecipeOut, status_code=201)
def create_recipe(
    data: RecipeCreate, user: CurrentUser, session: DbSession, key: IdempotencyKey = None
):
    repository = NutritionRepository(session)
    service = NutritionService(repository)
    return create_once(
        repository,
        user.id,
        "recipe",
        key,
        data,
        lambda: service.create_recipe(user.id, data),
        lambda resource_id: service.get_recipe(user.id, resource_id),
    )


@router.get("/recipes/{recipe_id}", response_model=RecipeOut)
def recipe(recipe_id: UUID, user: CurrentUser, session: DbSession):
    return NutritionService(NutritionRepository(session)).get_recipe(user.id, recipe_id)


@router.post("/nutrition/calculate-maintenance", response_model=MaintenanceOut)
def calculate_maintenance(data: MaintenanceInput):
    return {
        "maintenance_calories": maintenance(data.current_weight_kg),
        "calculation_method": METHOD,
        "is_estimate": True,
    }


@router.post("/nutrition/calculate-goals", response_model=GoalCalculationOut)
def calculate_goals(data: GoalCalculationInput, request: Request):
    return calculate_targets(
        data.current_weight_kg,
        data.target_weight_kg,
        data.deficit_kcal,
        request.app.state.settings.nutrition_min_daily_calories,
    )


@router.get("/foods/search", response_model=SearchOut)
def search(
    request: Request,
    user: CurrentUser,
    session: DbSession,
    q: Annotated[str, Query(min_length=1, max_length=100)],
    source: Literal["all", "local", "indian_curated", "usda", "open_food_facts"] = "all",
    page: Annotated[int, Query(ge=1, le=1000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    """Paginate each selected source independently; results are deduplicated by UUID."""
    providers = request.app.state.food_providers
    if source != "all":
        providers = {source: providers[source]} if source in providers else {}
    return NutritionService(NutritionRepository(session)).search(
        user.id,
        q,
        providers,
        local_source=source if source in {"indian_curated", "usda", "open_food_facts"} else None,
        page=page,
        page_size=page_size,
    )


@router.post("/foods/custom", response_model=FoodOut, status_code=201)
def custom_food(
    data: FoodCreate, user: CurrentUser, session: DbSession, key: IdempotencyKey = None
):
    repository = NutritionRepository(session)
    service = NutritionService(repository)
    return create_once(
        repository,
        user.id,
        "custom-food",
        key,
        data,
        lambda: service.custom_food(user.id, data),
        lambda resource_id: service.food(user.id, resource_id),
    )


@router.get("/foods/barcode/{barcode}", response_model=FoodOut)
def barcode_food(
    barcode: Annotated[str, Path(pattern=r"^[0-9]{8,14}$")],
    request: Request,
    user: CurrentUser,
    session: DbSession,
):
    return NutritionService(NutritionRepository(session)).barcode(
        user.id, barcode, request.app.state.food_providers.get("open_food_facts")
    )


@router.get("/foods/{food_id}/nutrition", response_model=FoodQuantityOut)
def food_quantity(
    food_id: UUID,
    quantity_g: Annotated[Decimal, Query(gt=0, le=100000, decimal_places=3)],
    user: CurrentUser,
    session: DbSession,
):
    return NutritionService(NutritionRepository(session)).quantity(user.id, food_id, quantity_g)


@router.get("/foods/{food_id}", response_model=FoodOut)
def food(food_id: UUID, user: CurrentUser, session: DbSession):
    return NutritionService(NutritionRepository(session)).food(user.id, food_id)


@router.post("/meals", response_model=MealOut, status_code=201)
def create_meal(
    data: MealCreate, user: CurrentUser, session: DbSession, key: IdempotencyKey = None
):
    repository = NutritionRepository(session)
    service = NutritionService(repository)
    meal = create_once(
        repository,
        user.id,
        "meal",
        key,
        data,
        lambda: service.create_meal(user.id, data),
        lambda resource_id: repository.meal(user.id, resource_id),
    )
    return service.output(meal)


@router.get("/meals", response_model=Page[MealOut])
def meals(
    user: CurrentUser,
    session: DbSession,
    date: date | None = None,
    limit: Limit = 20,
    offset: Offset = 0,
    start_date: date | None = None,
    end_date: date | None = None,
):
    service = NutritionService(NutritionRepository(session))
    return {
        "items": [
            service.output(meal)
            for meal in service.list_meals(user.id, date, limit, offset, start_date, end_date)
        ],
        "limit": limit,
        "offset": offset,
    }


@router.get("/meals/{meal_id}", response_model=MealOut)
def meal(meal_id: UUID, user: CurrentUser, session: DbSession):
    service = NutritionService(NutritionRepository(session))
    return service.output(service.get_meal(user.id, meal_id))


@router.patch("/meals/{meal_id}", response_model=MealOut)
def update_meal(meal_id: UUID, data: MealPatch, user: CurrentUser, session: DbSession):
    service = NutritionService(NutritionRepository(session))
    return service.output(service.update_meal(user.id, meal_id, data))


@router.delete("/meals/{meal_id}", status_code=204)
def delete_meal(meal_id: UUID, user: CurrentUser, session: DbSession):
    NutritionService(NutritionRepository(session)).delete_meal(user.id, meal_id)
    return Response(status_code=204)


@router.get("/nutrition/daily", response_model=DailyOut)
def daily(date: date, user: CurrentUser, session: DbSession):
    return NutritionService(NutritionRepository(session)).daily(user.id, date)


@router.get("/nutrition/dashboard", response_model=DashboardOut)
def dashboard(date: date, user: CurrentUser, session: DbSession):
    return NutritionService(NutritionRepository(session)).dashboard(user.id, date)
