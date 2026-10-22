from uuid import UUID

from fastapi import APIRouter, Request

from app.core.auth import CurrentUser
from app.db.dependencies import DbSession
from app.modules.common import Limit, Offset, Page
from app.modules.profiles.repository import ProfileRepository
from app.modules.profiles.schemas import (
    GoalCreate,
    GoalOut,
    GoalPatch,
    ProfileOut,
    ProfilePut,
    WeightCreate,
    WeightGoalConfirmation,
    WeightGoalPreview,
    WeightOut,
)
from app.modules.profiles.service import ProfileService

router = APIRouter(tags=["onboarding"])


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
):
    return ProfileService(
        ProfileRepository(session), request.app.state.settings.nutrition_min_daily_calories
    ).apply_weight(user.id, weight_id, data.expected_goal_id)


@router.get("/profile", response_model=ProfileOut)
def profile(user: CurrentUser, session: DbSession):
    return ProfileService(ProfileRepository(session)).get_profile(user.id)


@router.put("/profile", response_model=ProfileOut)
def put_profile(data: ProfilePut, user: CurrentUser, session: DbSession, request: Request):
    return ProfileService(
        ProfileRepository(session), request.app.state.settings.nutrition_min_daily_calories
    ).put_profile(user.id, data)


@router.post("/goals", response_model=GoalOut, status_code=201)
def create_goal(data: GoalCreate, user: CurrentUser, session: DbSession, request: Request):
    return ProfileService(
        ProfileRepository(session), request.app.state.settings.nutrition_min_daily_calories
    ).create_goal(user.id, data)


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
def add_weight(data: WeightCreate, user: CurrentUser, session: DbSession):
    return ProfileService(ProfileRepository(session)).add_weight(user.id, data)


@router.get("/weight-logs", response_model=Page[WeightOut])
def weights(user: CurrentUser, session: DbSession, limit: Limit = 20, offset: Offset = 0):
    return {
        "items": ProfileService(ProfileRepository(session)).weights(user.id, limit, offset),
        "limit": limit,
        "offset": offset,
    }
