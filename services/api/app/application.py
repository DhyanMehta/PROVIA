"""Application factory, usable without initializing a default configured app."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.v1.router import router
from app.core.auth import TokenVerifier
from app.core.config import Settings, get_settings
from app.core.cors import configure_cors
from app.core.exceptions import (
    ERROR_RESPONSES,
    SanitizedErrorMiddleware,
    register_exception_handlers,
)
from app.core.limits import RequestBodyLimitMiddleware
from app.core.logging import RequestLoggingMiddleware, configure_logging
from app.db.session import Database
from app.integrations.foods import OpenFoodFactsProvider, USDAProvider


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings if settings is not None else get_settings()
    configure_logging(settings)
    database = Database(settings)

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        yield
        database.dispose()

    # DEBUG controls logging, never Starlette's client-visible traceback pages.
    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        debug=False,
        docs_url="/docs",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )
    application.state.settings = settings
    application.state.database = database
    application.state.token_verifier = TokenVerifier(settings)
    application.state.food_providers = {
        "usda": USDAProvider(settings),
        "open_food_facts": OpenFoodFactsProvider(settings),
    }
    register_exception_handlers(application)
    application.include_router(router, prefix=settings.api_v1_prefix, responses=ERROR_RESPONSES)
    application.add_middleware(
        RequestBodyLimitMiddleware, max_bytes=settings.max_request_body_bytes
    )
    application.add_middleware(SanitizedErrorMiddleware)
    configure_cors(application, settings)
    application.add_middleware(RequestLoggingMiddleware)
    return application
