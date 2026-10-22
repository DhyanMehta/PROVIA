"""PROVIA API entry point."""

from fastapi import FastAPI

from app.api.v1.router import router
from app.core.config import Settings, get_settings
from app.core.cors import configure_cors
from app.core.exceptions import SanitizedErrorMiddleware, register_exception_handlers
from app.core.logging import RequestLoggingMiddleware, configure_logging


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings if settings is not None else get_settings()
    configure_logging(settings)
    # DEBUG controls logging, never Starlette's client-visible traceback pages.
    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        debug=False,
        docs_url="/docs",
        openapi_url="/openapi.json",
    )
    application.state.settings = settings
    register_exception_handlers(application)
    application.include_router(router, prefix=settings.api_v1_prefix)
    application.add_middleware(SanitizedErrorMiddleware)
    configure_cors(application, settings)
    application.add_middleware(RequestLoggingMiddleware)
    return application


app = create_app()
