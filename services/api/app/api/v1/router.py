"""Registration point for version 1 endpoint routers."""

from fastapi import APIRouter

from app.api.v1.endpoints.health import router as health_router
from app.modules.nutrition.router import router as nutrition_router
from app.modules.profiles.router import router as profiles_router
from app.modules.users.router import router as users_router

router = APIRouter()
router.include_router(health_router)
router.include_router(users_router)
router.include_router(profiles_router)
router.include_router(nutrition_router)
