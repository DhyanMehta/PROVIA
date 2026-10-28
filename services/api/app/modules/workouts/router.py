from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Response

from app.core.auth import CurrentUser
from app.db.dependencies import DbSession
from app.db.models import WorkoutPlan, WorkoutSession
from app.modules.common import Input, Limit, Offset, Page
from app.modules.idempotency import IdempotencyKey, create_once
from app.modules.tracking.service import date_range
from app.modules.workouts import schemas as s
from app.modules.workouts.repository import WorkoutRepository
from app.modules.workouts.service import WorkoutService

router = APIRouter(tags=["workouts"])


@router.get("/exercises", response_model=Page[s.ExerciseOut])
def exercises(
    user: CurrentUser,
    session: DbSession,
    q: Annotated[str | None, Query(max_length=200)] = None,
    muscle_group: str | None = None,
    equipment: str | None = None,
    category: s.Category | None = None,
    limit: Limit = 20,
    offset: Offset = 0,
):
    return {
        "items": WorkoutRepository(session).exercises(
            user.id, q, muscle_group, equipment, category, limit, offset
        ),
        "limit": limit,
        "offset": offset,
    }


@router.post("/exercises/custom", response_model=s.ExerciseOut, status_code=201)
def create_exercise(
    data: s.ExerciseCreate, user: CurrentUser, session: DbSession, key: IdempotencyKey = None
):
    repository = WorkoutRepository(session)
    return create_once(
        repository,
        user.id,
        "custom-exercise",
        key,
        data,
        lambda: WorkoutService(repository).create_exercise(user.id, data),
        lambda row_id: repository.exercise(user.id, row_id, allow_archived=True),
    )


@router.get("/exercises/{exercise_id}", response_model=s.ExerciseOut)
def exercise(exercise_id: UUID, user: CurrentUser, session: DbSession):
    return WorkoutRepository(session).exercise(user.id, exercise_id, allow_archived=True)


@router.patch("/exercises/custom/{exercise_id}", response_model=s.ExerciseOut)
def patch_exercise(exercise_id: UUID, data: s.ExercisePatch, user: CurrentUser, session: DbSession):
    return WorkoutService(WorkoutRepository(session)).edit_exercise(user.id, exercise_id, data)


@router.delete("/exercises/custom/{exercise_id}", status_code=204)
def delete_exercise(exercise_id: UUID, user: CurrentUser, session: DbSession):
    WorkoutService(WorkoutRepository(session)).edit_exercise(user.id, exercise_id)
    return Response(status_code=204)


@router.post("/workout-plans", response_model=s.PlanOut, status_code=201)
def create_plan(
    data: s.PlanCreate, user: CurrentUser, session: DbSession, key: IdempotencyKey = None
):
    repository = WorkoutRepository(session)
    return create_once(
        repository,
        user.id,
        "workout-plan",
        key,
        data,
        lambda: WorkoutService(repository).plan(user.id, data),
        lambda row_id: repository.owned(WorkoutPlan, user.id, row_id),
    )


@router.get("/workout-plans", response_model=Page[s.PlanOut])
def plans(user: CurrentUser, session: DbSession, limit: Limit = 20, offset: Offset = 0):
    return {
        "items": WorkoutRepository(session).plans(user.id, limit, offset),
        "limit": limit,
        "offset": offset,
    }


@router.get("/workout-plans/{plan_id}", response_model=s.PlanOut)
def plan(plan_id: UUID, user: CurrentUser, session: DbSession):
    return WorkoutRepository(session).owned(WorkoutPlan, user.id, plan_id)


@router.patch("/workout-plans/{plan_id}", response_model=s.PlanOut)
def patch_plan(plan_id: UUID, data: s.PlanPatch, user: CurrentUser, session: DbSession):
    return WorkoutService(WorkoutRepository(session)).plan(user.id, data, plan_id)


@router.delete("/workout-plans/{plan_id}", status_code=204)
def delete_plan(plan_id: UUID, user: CurrentUser, session: DbSession):
    WorkoutService(WorkoutRepository(session)).delete_plan(user.id, plan_id)
    return Response(status_code=204)


@router.post("/workout-plans/{plan_id}/duplicate", response_model=s.PlanOut, status_code=201)
def duplicate_plan(
    plan_id: UUID, user: CurrentUser, session: DbSession, key: IdempotencyKey = None
):
    repository = WorkoutRepository(session)

    def copy():
        repository.lock_user(user.id)
        original = repository.owned(WorkoutPlan, user.id, plan_id)
        data = s.PlanOut.model_validate(original).model_dump(exclude={"id"})
        data["is_active"] = False
        for day in data["days"]:
            day.pop("id")
            for exercise in day["exercises"]:
                exercise.pop("id")
        return WorkoutService(repository).plan(user.id, s.PlanCreate.model_validate(data))

    return create_once(
        repository,
        user.id,
        "duplicate-plan",
        key,
        Input(),
        copy,
        lambda row_id: repository.owned(WorkoutPlan, user.id, row_id),
        context=str(plan_id),
    )


@router.post("/workout-sessions", response_model=s.SessionOut, status_code=201)
def start(
    data: s.SessionCreate,
    user: CurrentUser,
    session: DbSession,
    idempotency_key: IdempotencyKey = None,
):
    """Start one active workout. Retry with the same optional UUID Idempotency-Key."""
    repository = WorkoutRepository(session)
    return create_once(
        repository,
        user.id,
        "workout-session",
        idempotency_key,
        data,
        lambda: WorkoutService(repository).start(user.id, data),
        lambda row_id: repository.owned(WorkoutSession, user.id, row_id),
    )


@router.get("/workout-sessions", response_model=Page[s.SessionOut])
def sessions(
    user: CurrentUser,
    session: DbSession,
    start_date: date | None = None,
    end_date: date | None = None,
    status: s.SessionStatus | None = None,
    limit: Limit = 20,
    offset: Offset = 0,
):
    repository = WorkoutRepository(session)
    _, _, begin, finish = date_range(start_date, end_date, repository.timezone(user.id))
    return {
        "items": repository.sessions(user.id, begin, finish, status, limit, offset),
        "limit": limit,
        "offset": offset,
    }


@router.get("/workout-sessions/active", response_model=s.SessionOut | None)
def active_session(user: CurrentUser, session: DbSession):
    """Return the newest in-progress workout, regardless of start date, or null."""
    return WorkoutRepository(session).active_session(user.id)


@router.get("/workout-sessions/{session_id}", response_model=s.SessionOut)
def get_session(session_id: UUID, user: CurrentUser, session: DbSession):
    return WorkoutRepository(session).owned(WorkoutSession, user.id, session_id)


@router.patch("/workout-sessions/{session_id}", response_model=s.SessionOut)
def patch_session(session_id: UUID, data: s.SessionPatch, user: CurrentUser, session: DbSession):
    return WorkoutService(WorkoutRepository(session)).edit_session(user.id, session_id, data)


@router.post("/workout-sessions/{session_id}/complete", response_model=s.SessionOut)
def complete(session_id: UUID, data: s.CompleteInput, user: CurrentUser, session: DbSession):
    return WorkoutService(WorkoutRepository(session)).complete(user.id, session_id, data)


@router.post("/workout-sessions/{session_id}/sets", response_model=s.SetOut, status_code=201)
def add_set(session_id: UUID, data: s.SetCreate, user: CurrentUser, session: DbSession):
    return WorkoutService(WorkoutRepository(session)).set(user.id, session_id, data)


@router.patch("/workout-sessions/{session_id}/sets/{set_id}", response_model=s.SetOut)
def patch_set(
    session_id: UUID, set_id: UUID, data: s.SetPatch, user: CurrentUser, session: DbSession
):
    return WorkoutService(WorkoutRepository(session)).set(user.id, session_id, data, set_id)


@router.delete("/workout-sessions/{session_id}/sets/{set_id}", status_code=204)
def delete_set(session_id: UUID, set_id: UUID, user: CurrentUser, session: DbSession):
    WorkoutService(WorkoutRepository(session)).delete_set(user.id, session_id, set_id)
    return Response(status_code=204)
