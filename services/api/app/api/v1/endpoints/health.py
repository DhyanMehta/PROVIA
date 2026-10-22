"""Process health only; no database or external service checks."""

from fastapi import APIRouter, Request
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.exceptions import AppError

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
def health(request: Request) -> dict[str, str]:
    settings = request.app.state.settings
    return {"status": "ok", "service": settings.app_name, "version": settings.app_version}


@router.get("/ready")
def ready(request: Request) -> dict[str, str]:
    return {"status": "ready", "service": request.app.state.settings.app_name}


@router.get("/db")
def database_health(request: Request) -> dict[str, str]:
    try:
        with request.app.state.database.engine.connect() as connection:
            if connection.scalar(text("SELECT 1")) != 1:
                raise AppError("DATABASE_UNAVAILABLE", "Database is unavailable", 503)
    except SQLAlchemyError:
        raise AppError("DATABASE_UNAVAILABLE", "Database is unavailable", 503) from None
    return {"status": "ok", "service": request.app.state.settings.app_name, "database": "ok"}
