"""Process health only; no database or external service checks."""

from fastapi import APIRouter, Request

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
def health(request: Request) -> dict[str, str]:
    settings = request.app.state.settings
    return {"status": "ok", "service": settings.app_name, "version": settings.app_version}


@router.get("/ready")
def ready(request: Request) -> dict[str, str]:
    return {"status": "ready", "service": request.app.state.settings.app_name}
