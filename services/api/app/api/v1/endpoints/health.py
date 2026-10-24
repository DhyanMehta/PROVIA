"""Process health only; no database or external service checks."""

from fastapi import APIRouter, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.exceptions import AppError

router = APIRouter(prefix="/health", tags=["health"])


class ReadyOut(BaseModel):
    status: str
    service: str


class HealthOut(ReadyOut):
    version: str


class DatabaseHealthOut(ReadyOut):
    database: str


@router.get("", response_model=HealthOut)
def health(request: Request) -> dict[str, str]:
    settings = request.app.state.settings
    return {"status": "ok", "service": settings.app_name, "version": settings.app_version}


@router.get("/ready", response_model=ReadyOut)
def ready(request: Request) -> dict[str, str]:
    return {"status": "ready", "service": request.app.state.settings.app_name}


@router.get("/db", response_model=DatabaseHealthOut)
def database_health(request: Request) -> dict[str, str]:
    try:
        with request.app.state.database.engine.connect() as connection:
            if connection.scalar(text("SELECT 1")) != 1:
                raise AppError("DATABASE_UNAVAILABLE", "Database is unavailable", 503)
    except SQLAlchemyError:
        raise AppError("DATABASE_UNAVAILABLE", "Database is unavailable", 503) from None
    return {"status": "ok", "service": request.app.state.settings.app_name, "database": "ok"}
