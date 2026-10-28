from datetime import date
from uuid import UUID

from fastapi import APIRouter, Request, Response

from app.core.auth import CurrentUser
from app.db.dependencies import DbSession
from app.modules.auth.dependencies import Identity
from app.modules.common import Limit, Offset, Page
from app.modules.idempotency import IdempotencyKey, create_once
from app.modules.profiles.repository import ProfileRepository
from app.modules.profiles.schemas import (
    GoalCreate,
    GoalOut,
    GoalPatch,
    OnboardingOut,
    ProfileOut,
    ProfilePut,
    WeightCreate,
    WeightGoalConfirmation,
    WeightGoalPreview,
    WeightOut,
    WeightPatch,
)
from app.modules.profiles.service import ProfileService

router = APIRouter(tags=["onboarding"])


@router.get("/onboarding", response_model=OnboardingOut)
def onboarding(principal: Identity, session: DbSession):
    """Derive the next screen from account, profile and active goal; no stored flag."""
    return ProfileService(ProfileRepository(session)).onboarding(principal)


@router.post("/weight-logs/{weight_id}/goal-preview", response_model=WeightGoalPreview)
def weight_goal_preview(weight_id: UUID, user: CurrentUser, session: DbSession, request: Request):
    return ProfileService(
        ProfileRepository(session), request.app.state.settings.nutrition_min_daily_calories
    ).weight_preview(user.id, weight_id)


@router.post("/weight-logs/{weight_id}/apply-goal", response_model=GoalOut, status_code=201)
def apply_weight_goal(
    weight_id: UUID,
    data: WeightGoalConfirmation,
    user: CurrentUser,
    session: DbSession,
    request: Request,
    idempotency_key: IdempotencyKey = None,
):
    repository = ProfileRepository(session)
    service = ProfileService(repository, request.app.state.settings.nutrition_min_daily_calories)
    return create_once(
        repository,
        user.id,
        "weight-goal",
        idempotency_key,
        data,
        lambda: service.apply_weight(
            user.id, weight_id, data.expected_goal_id, data.expected_weight_kg
        ),
        lambda goal_id: repository.goal(user.id, goal_id),
        context=str(weight_id),
    )


@router.get("/profile", response_model=ProfileOut)
def profile(user: CurrentUser, session: DbSession):
    return ProfileService(ProfileRepository(session)).get_profile(user.id)


@router.put("/profile", response_model=ProfileOut)
def put_profile(data: ProfilePut, user: CurrentUser, session: DbSession, request: Request):
    return ProfileService(
        ProfileRepository(session), request.app.state.settings.nutrition_min_daily_calories
    ).put_profile(user.id, data)


@router.post("/goals", response_model=GoalOut, status_code=201)
def create_goal(
    data: GoalCreate,
    user: CurrentUser,
    session: DbSession,
    request: Request,
    idempotency_key: IdempotencyKey = None,
):
    repository = ProfileRepository(session)
    service = ProfileService(repository, request.app.state.settings.nutrition_min_daily_calories)
    return create_once(
        repository,
        user.id,
        "goal",
        idempotency_key,
        data,
        lambda: service.create_goal(user.id, data),
        lambda goal_id: repository.goal(user.id, goal_id),
    )


@router.get("/goals", response_model=Page[GoalOut])
def goals(user: CurrentUser, session: DbSession, limit: Limit = 20, offset: Offset = 0):
    return {
        "items": ProfileService(ProfileRepository(session)).goals(user.id, limit, offset),
        "limit": limit,
        "offset": offset,
    }


@router.patch("/goals/{goal_id}", response_model=GoalOut)
def update_goal(
    goal_id: UUID, data: GoalPatch, user: CurrentUser, session: DbSession, request: Request
):
    return ProfileService(
        ProfileRepository(session), request.app.state.settings.nutrition_min_daily_calories
    ).update_goal(user.id, goal_id, data)


@router.post("/weight-logs", response_model=WeightOut, status_code=201)
def add_weight(
    data: WeightCreate,
    user: CurrentUser,
    session: DbSession,
    idempotency_key: IdempotencyKey = None,
):
    repository = ProfileRepository(session)
    service = ProfileService(repository)
    return create_once(
        repository,
        user.id,
        "weight-log",
        idempotency_key,
        data,
        lambda: service.add_weight(user.id, data),
        lambda row_id: repository.weight(user.id, row_id),
    )


@router.get("/weight-logs/latest", response_model=WeightOut)
def latest_weight(user: CurrentUser, session: DbSession):
    return ProfileService(ProfileRepository(session)).latest_weight(user.id)


@router.get("/weight-logs/{weight_id}", response_model=WeightOut)
def weight(weight_id: UUID, user: CurrentUser, session: DbSession):
    return ProfileService(ProfileRepository(session)).weight(user.id, weight_id)


@router.patch("/weight-logs/{weight_id}", response_model=WeightOut)
def patch_weight(weight_id: UUID, data: WeightPatch, user: CurrentUser, session: DbSession):
    """Correct a measurement without changing profile or historical goal snapshots."""
    return ProfileService(ProfileRepository(session)).patch_weight(user.id, weight_id, data)


@router.delete("/weight-logs/{weight_id}", status_code=204)
def delete_weight(weight_id: UUID, user: CurrentUser, session: DbSession):
    ProfileService(ProfileRepository(session)).delete_weight(user.id, weight_id)
    return Response(status_code=204)


@router.get("/weight-logs", response_model=Page[WeightOut])
def weights(
    user: CurrentUser,
    session: DbSession,
    limit: Limit = 20,
    offset: Offset = 0,
    start_date: date | None = None,
    end_date: date | None = None,
):
    return {
        "items": ProfileService(ProfileRepository(session)).weights(
            user.id, limit, offset, start_date, end_date
        ),
        "limit": limit,
        "offset": offset,
    }
