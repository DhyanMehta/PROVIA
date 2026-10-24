"""Safe request metadata logging using request-local context."""

import json
import logging
from contextvars import ContextVar
from time import perf_counter
from uuid import uuid4

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import Settings

request_id_context: ContextVar[str] = ContextVar("request_id", default="-")
error_category_context: ContextVar[str | None] = ContextVar("error_category", default=None)
logger = logging.getLogger("provia.requests")


class SafeJsonFormatter(logging.Formatter):
    def format(self, record):
        payload = {
            "time": self.formatTime(record),
            "level": record.levelname,
            "environment": record.environment,
            "request_id": record.request_id,
            "message": record.getMessage(),
            "error_category": error_category_context.get(),
        }
        for name in ("method", "route", "status", "duration_ms"):
            if hasattr(record, name):
                payload[name] = getattr(record, name)
        return json.dumps(payload)


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
    handler.setFormatter(SafeJsonFormatter())
    app_logger.addHandler(handler)
    # Uvicorn's default access log contains raw paths and query strings.
    logging.getLogger("uvicorn.access").disabled = True
    # Provider request URLs may contain API keys; never emit transport debug logs.
    logging.getLogger("httpx").disabled = True
    logging.getLogger("httpcore").disabled = True


class RequestLoggingMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request_id = str(uuid4())
        token = request_id_context.set(request_id)
        error_token = error_category_context.set(None)
        start = perf_counter()
        status = 500

        async def send_with_id(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                MutableHeaders(scope=message)["X-Request-ID"] = request_id
                MutableHeaders(scope=message)["X-Content-Type-Options"] = "nosniff"
                MutableHeaders(scope=message)["Referrer-Policy"] = "no-referrer"
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            route = scope.get("route")
            path = getattr(route, "path", "<unmatched>")
            method = scope["method"]
            if method not in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}:
                method = "OTHER"
            duration = round((perf_counter() - start) * 1000, 2)
            logger.info(
                "method=%s path=%s status=%s duration_ms=%.2f",
                method,
                path,
                status,
                duration,
                extra={"method": method, "route": path, "status": status, "duration_ms": duration},
            )
            error_category_context.reset(error_token)
            request_id_context.reset(token)
