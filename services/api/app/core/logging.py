"""Safe request metadata logging using request-local context."""

import logging
from contextvars import ContextVar
from time import perf_counter
from uuid import uuid4

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import Settings

request_id_context: ContextVar[str] = ContextVar("request_id", default="-")
logger = logging.getLogger("provia.requests")


class RequestContextFilter(logging.Filter):
    def __init__(self, environment: str) -> None:
        super().__init__()
        self.environment = environment

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_context.get()
        record.environment = self.environment
        return True


def configure_logging(settings: Settings) -> None:
    app_logger = logging.getLogger("provia")
    level = settings.log_level or (
        "DEBUG" if settings.debug and settings.app_env in {"development", "testing"} else "INFO"
    )
    app_logger.setLevel(level)
    app_logger.propagate = False
    # Reconfigure only our own handler, keeping repeated factory calls idempotent.
    for handler in app_logger.handlers[:]:
        if handler.get_name() == "provia-console":
            app_logger.removeHandler(handler)
            handler.close()
    handler = logging.StreamHandler()
    handler.set_name("provia-console")
    handler.addFilter(RequestContextFilter(settings.app_env))
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s %(levelname)s env=%(environment)s request_id=%(request_id)s %(message)s"
        )
    )
    app_logger.addHandler(handler)
    # Uvicorn's default access log contains raw paths and query strings.
    logging.getLogger("uvicorn.access").disabled = True


class RequestLoggingMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request_id = str(uuid4())
        token = request_id_context.set(request_id)
        start = perf_counter()
        status = 500

        async def send_with_id(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                MutableHeaders(scope=message)["X-Request-ID"] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            route = scope.get("route")
            path = getattr(route, "path", "<unmatched>")
            method = scope["method"]
            if method not in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}:
                method = "OTHER"
            logger.info(
                "method=%s path=%s status=%s duration_ms=%.2f",
                method,
                path,
                status,
                (perf_counter() - start) * 1000,
            )
            request_id_context.reset(token)
