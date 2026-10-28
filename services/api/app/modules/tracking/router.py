from datetime import date
from uuid import UUID

from fastapi import APIRouter, Response

from app.core.auth import CurrentUser
from app.db.dependencies import DbSession
from app.db.models import SleepSession, WaterLog
from app.modules.common import Limit, Offset, Page, day_bounds
from app.modules.idempotency import IdempotencyKey, create_once
from app.modules.tracking import schemas as s
from app.modules.tracking.repository import TrackingRepository
from app.modules.tracking.service import TrackingService, date_range

router = APIRouter(tags=["tracking"])


@router.post("/water-logs", response_model=s.WaterOut, status_code=201)
def add_water(
    data: s.WaterCreate,
    user: CurrentUser,
    session: DbSession,
    idempotency_key: IdempotencyKey = None,
):
    repository = TrackingRepository(session)
    return create_once(
        repository,
        user.id,
        "water-log",
        idempotency_key,
        data,
        lambda: TrackingService(repository).add_water(user.id, data),
        lambda row_id: repository.owned(WaterLog, user.id, row_id),
    )


@router.get("/water-logs", response_model=Page[s.WaterOut])
def water_logs(
    user: CurrentUser,
    session: DbSession,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: Limit = 20,
    offset: Offset = 0,
):
    return {
        "items": TrackingService(TrackingRepository(session)).logs(
            WaterLog, WaterLog.consumed_at, user.id, start_date, end_date, limit, offset
        ),
        "limit": limit,
        "offset": offset,
    }


@router.patch("/water-logs/{log_id}", response_model=s.WaterOut)
def patch_water(log_id: UUID, data: s.WaterPatch, user: CurrentUser, session: DbSession):
    return TrackingService(TrackingRepository(session)).patch_water(user.id, log_id, data)


@router.delete("/water-logs/{log_id}", status_code=204)
def delete_water(log_id: UUID, user: CurrentUser, session: DbSession):
    repository = TrackingRepository(session)
    repository.delete(repository.owned(WaterLog, user.id, log_id, lock=True))
    return Response(status_code=204)


@router.put("/water/target", response_model=s.TargetOut)
def water_target(data: s.TargetPut, user: CurrentUser, session: DbSession):
    return TrackingService(TrackingRepository(session)).target(user.id, data)


@router.put("/activity/daily", response_model=s.ActivityOut)
def put_activity(data: s.ActivityPut, user: CurrentUser, session: DbSession):
    return TrackingService(TrackingRepository(session)).activity(user.id, data)


@router.get("/activity/daily", response_model=s.ActivityOut | None)
def activity(date: date, user: CurrentUser, session: DbSession):
    repository = TrackingRepository(session)
    day_bounds(date, repository.timezone(user.id))
    return repository.activity(user.id, date)


@router.get("/activity", response_model=Page[s.ActivityOut])
def activities(
    user: CurrentUser,
    session: DbSession,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: Limit = 20,
    offset: Offset = 0,
):
    """List stored local-day snapshots; omitted days have no inferred zero values."""
    repository = TrackingRepository(session)
    start, end, _, _ = date_range(start_date, end_date, repository.timezone(user.id))
    return {
        "items": repository.activities(user.id, start, end, limit, offset),
        "limit": limit,
        "offset": offset,
    }


@router.delete("/activity/daily", status_code=204)
def delete_activity(date: date, user: CurrentUser, session: DbSession):
    """Delete the owned daily snapshot. Clients must discard obsolete queued uploads."""
    repository = TrackingRepository(session)
    day_bounds(date, repository.timezone(user.id))
    repository.lock_user(user.id)
    row = repository.activity(user.id, date)
    if row is not None:
        repository.delete(row)
    return Response(status_code=204)


@router.post("/sleep-sessions", response_model=s.SleepOut, status_code=201)
def add_sleep(
    data: s.SleepCreate,
    user: CurrentUser,
    session: DbSession,
    idempotency_key: IdempotencyKey = None,
):
    repository = TrackingRepository(session)
    return create_once(
        repository,
        user.id,
        "sleep-session",
        idempotency_key,
        data,
        lambda: TrackingService(repository).sleep(user.id, data),
        lambda row_id: repository.owned(SleepSession, user.id, row_id),
    )


@router.get("/sleep-sessions", response_model=Page[s.SleepOut])
def sleep_logs(
    user: CurrentUser,
    session: DbSession,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: Limit = 20,
    offset: Offset = 0,
):
    return {
        "items": TrackingService(TrackingRepository(session)).logs(
            SleepSession, SleepSession.ended_at, user.id, start_date, end_date, limit, offset
        ),
        "limit": limit,
        "offset": offset,
    }


@router.get("/sleep-sessions/{session_id}", response_model=s.SleepOut)
def sleep(session_id: UUID, user: CurrentUser, session: DbSession):
    return TrackingRepository(session).owned(SleepSession, user.id, session_id)


@router.patch("/sleep-sessions/{session_id}", response_model=s.SleepOut)
def patch_sleep(session_id: UUID, data: s.SleepPatch, user: CurrentUser, session: DbSession):
    return TrackingService(TrackingRepository(session)).sleep(user.id, data, session_id)


@router.delete("/sleep-sessions/{session_id}", status_code=204)
def delete_sleep(session_id: UUID, user: CurrentUser, session: DbSession):
    repository = TrackingRepository(session)
    repository.lock_user(user.id)
    repository.delete(repository.owned(SleepSession, user.id, session_id, lock=True))
    return Response(status_code=204)
