from datetime import date
from uuid import UUID

from fastapi import APIRouter

from app.core.auth import CurrentUser
from app.db.dependencies import DbSession
from app.modules.insights.repository import InsightsRepository
from app.modules.insights.schemas import (
    ActivitySummary,
    DailyDashboard,
    ProgressOverview,
    SleepSummary,
    WaterDashboard,
    WorkoutSummary,
)
from app.modules.insights.service import InsightsService
from app.modules.workouts.repository import WorkoutRepository

router = APIRouter(tags=["progress"])


@router.get("/workouts/summary", response_model=WorkoutSummary)
@router.get("/workouts/progress", response_model=WorkoutSummary)
def workouts(
    user: CurrentUser,
    session: DbSession,
    start_date: date | None = None,
    end_date: date | None = None,
):
    return InsightsService(InsightsRepository(session)).workouts(user.id, start_date, end_date)


@router.get("/workouts/exercises/{exercise_id}/history", response_model=WorkoutSummary)
def exercise_history(
    exercise_id: UUID,
    user: CurrentUser,
    session: DbSession,
    start_date: date | None = None,
    end_date: date | None = None,
):
    WorkoutRepository(session).exercise(user.id, exercise_id, allow_archived=True)
    return InsightsService(InsightsRepository(session)).workouts(
        user.id, start_date, end_date, exercise_id
    )


@router.get("/water/dashboard", response_model=WaterDashboard)
def water(date: date, user: CurrentUser, session: DbSession):
    return InsightsService(InsightsRepository(session)).water_dashboard(user.id, date)


@router.get("/activity/summary", response_model=ActivitySummary)
def activity(
    user: CurrentUser,
    session: DbSession,
    start_date: date | None = None,
    end_date: date | None = None,
):
    return InsightsService(InsightsRepository(session)).activity_summary(
        user.id, start_date, end_date
    )


@router.get("/sleep/summary", response_model=SleepSummary)
def sleep(
    user: CurrentUser,
    session: DbSession,
    start_date: date | None = None,
    end_date: date | None = None,
):
    return InsightsService(InsightsRepository(session)).sleep_summary(user.id, start_date, end_date)


@router.get("/dashboard/today", response_model=DailyDashboard)
def dashboard(user: CurrentUser, session: DbSession, date: date | None = None):
    return InsightsService(InsightsRepository(session)).dashboard(user.id, date)


@router.get("/progress/overview", response_model=ProgressOverview)
def overview(
    user: CurrentUser,
    session: DbSession,
    start_date: date | None = None,
    end_date: date | None = None,
):
    return InsightsService(InsightsRepository(session)).overview(user.id, start_date, end_date)
