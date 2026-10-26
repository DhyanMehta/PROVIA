"""Public error envelopes with no exception values or request inputs."""

import logging
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger("provia.errors")


class ErrorDetail(BaseModel):
    source: str
    code: str
    message: str


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail] | None


class ErrorEnvelope(BaseModel):
    error: ErrorBody


ERROR_RESPONSES = {
    status: {"model": ErrorEnvelope, "description": HTTPStatus(status).phrase}
    for status in (400, 401, 403, 404, 409, 413, 422, 429, 500, 503)
}


class AppError(Exception):
    """An intentional public error. Code/message must be static, client-safe text."""

    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        super().__init__(code)
        self.code = code
        self.message = message
        self.status_code = status_code


def error_response(
    status: int,
    code: str,
    message: str,
    details: list[dict] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    from app.core.logging import error_category_context

    error_category_context.set(code)
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "details": details}},
        headers=headers,
    )


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    headers = (
        {"Retry-After": "900" if exc.code == "RATE_LIMITED" else "2"}
        if exc.status_code == 429
        else None
    )
    return error_response(exc.status_code, exc.code, exc.message, headers=headers)


async def http_error_handler(request: Request, exc: HTTPException) -> JSONResponse:
    if exc.status_code == 404:
        code, message = "RESOURCE_NOT_FOUND", "Requested resource was not found"
    else:
        code = f"HTTP_{exc.status_code}"
        try:
            message = HTTPStatus(exc.status_code).phrase
        except ValueError:
            message = "Request failed"
    return error_response(exc.status_code, code, message, headers=exc.headers)


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Pydantic's input, ctx and even custom validator messages can contain secrets.
    # Omit dynamic location segments too: dict keys may be user-supplied input.
    details = [
        {
            "source": str(error["loc"][0]) if error["loc"] else "request",
            "code": error["type"],
            "message": "Invalid or missing value",
        }
        for error in exc.errors()
    ]
    return error_response(422, "VALIDATION_ERROR", "Request validation failed", details)


async def internal_error_handler(request: Request, exc: Exception) -> JSONResponse:
    # Never format exc or a traceback: either can embed credentials or input.
    logger.error("Unexpected application error")
    return error_response(500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred")


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(HTTPException, http_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(Exception, internal_error_handler)


class SanitizedErrorMiddleware:
    """Handle failures inside CORS/request logging, without server traceback logging."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = False

        async def track_send(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, receive, track_send)
        except Exception as exc:
            response = await internal_error_handler(Request(scope), exc)
            if not started:
                await response(scope, receive, send)
