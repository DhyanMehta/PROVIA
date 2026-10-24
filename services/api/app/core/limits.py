"""Bound JSON request memory before parsing or starting a database transaction."""

from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.exceptions import error_response


class RequestBodyLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        lengths = [value for name, value in scope["headers"] if name.lower() == b"content-length"]
        if lengths and (len(lengths) != 1 or len(lengths[0]) > 20 or not lengths[0].isdigit()):
            await error_response(400, "INVALID_CONTENT_LENGTH", "Invalid request length")(
                scope, receive, send
            )
            return
        if lengths and int(lengths[0]) > self.max_bytes:
            await self.too_large(scope, receive, send)
            return
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            if len(body) + len(chunk) > self.max_bytes:
                await self.too_large(scope, receive, send)
                return
            body.extend(chunk)
            if not message.get("more_body", False):
                break
        consumed = False

        async def replay():
            nonlocal consumed
            if not consumed:
                consumed = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)

    async def too_large(self, scope, receive, send):
        await error_response(413, "REQUEST_TOO_LARGE", "Request body exceeds the configured limit")(
            scope, receive, send
        )
