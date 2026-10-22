import asyncio
import logging
from uuid import UUID

import httpx
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel, field_validator

from app.core.config import Settings
from app.core.exceptions import AppError
from app.core.logging import request_id_context
from app.main import create_app


def test_cors(client):
    allowed = client.options(
        "/api/v1/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-credentials" not in allowed.headers
    denied = client.options(
        "/api/v1/health",
        headers={
            "Origin": "https://unconfigured.example",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert denied.status_code == 400
    assert "access-control-allow-origin" not in denied.headers
    assert "x-request-id" in denied.headers


def test_credential_cors():
    app = create_app(Settings(_env_file=None, cors_allow_credentials=True))
    with TestClient(app) as client:
        response = client.get("/api/v1/health", headers={"Origin": "http://localhost:5173"})
    assert response.headers["access-control-allow-credentials"] == "true"
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-expose-headers" not in response.headers


def test_custom_exception(application):
    @application.get("/custom-error")
    def custom_error():
        raise AppError("CONFLICT", "Resource already exists", 409)

    with TestClient(application) as client:
        response = client.get("/custom-error")
    assert response.status_code == 409
    assert response.json() == {
        "error": {
            "code": "CONFLICT",
            "message": "Resource already exists",
            "details": None,
        }
    }


def test_http_exception_headers_and_sanitization(application):
    @application.get("/http-error")
    def http_error():
        raise HTTPException(401, detail="secret-value", headers={"WWW-Authenticate": "Bearer"})

    with TestClient(application) as client:
        response = client.get("/http-error")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json()["error"]["code"] == "HTTP_401"
    assert "secret-value" not in response.text


def test_unknown_route(client):
    response = client.get("/missing?token=secret")
    assert response.status_code == 404
    assert response.json() == {
        "error": {
            "code": "RESOURCE_NOT_FOUND",
            "message": "Requested resource was not found",
            "details": None,
        }
    }


def test_validation_sanitization(application):
    class Payload(BaseModel):
        password: str

        @field_validator("password")
        @classmethod
        def reject(cls, value):
            raise ValueError(f"Sensitive input: {value}")

    @application.post("/validate")
    def validate(payload: Payload):
        return {}

    with TestClient(application) as client:
        response = client.post("/validate", json={"password": "never-expose-this"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert response.json()["error"]["details"] == [
        {"source": "body", "code": "value_error", "message": "Invalid or missing value"}
    ]
    assert "never-expose-this" not in response.text
    assert "Sensitive input" not in response.text


def test_unexpected_error_and_safe_logging(capsys):
    application = create_app(Settings(_env_file=None, debug=True))

    @application.get("/crash/{item}")
    def crash(item: str):
        raise RuntimeError("secret-exception-value")

    with TestClient(application) as client:
        response = client.get(
            "/crash/secret-path?token=secret-query",
            headers={
                "Authorization": "Bearer secret-auth",
                "Origin": "http://localhost:5173",
            },
        )
    assert response.status_code == 500
    assert response.json() == {
        "error": {
            "code": "INTERNAL_SERVER_ERROR",
            "message": "An unexpected error occurred",
            "details": None,
        }
    }
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    output = capsys.readouterr().err
    assert "Unexpected application error" in output
    assert response.headers["x-request-id"] in output
    assert "path=/crash/{item}" in output
    assert "status=500" in output
    assert "duration_ms=" in output
    for secret in ["secret-exception-value", "secret-path", "secret-query", "secret-auth"]:
        assert secret not in output + response.text
    assert "Traceback" not in output + response.text
    assert request_id_context.get() == "-"


def test_request_ids(client):
    first = client.get("/api/v1/health", headers={"X-Request-ID": "untrusted-id"})
    second = client.get("/api/v1/health")
    first_id, second_id = first.headers["x-request-id"], second.headers["x-request-id"]
    assert UUID(first_id).version == 4
    assert UUID(second_id).version == 4
    assert first_id != second_id


def test_concurrent_request_context(application):
    @application.get("/context")
    async def context():
        before = request_id_context.get()
        await asyncio.sleep(0.01)
        return {"before": before, "after": request_id_context.get()}

    async def run_requests():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=application), base_url="http://test"
        ) as client:
            return await asyncio.gather(*(client.get("/context") for _ in range(10)))

    responses = asyncio.run(run_requests())
    assert len({response.headers["x-request-id"] for response in responses}) == 10
    for response in responses:
        assert response.json() == dict.fromkeys(
            ["before", "after"], response.headers["x-request-id"]
        )
    assert request_id_context.get() == "-"


def test_logging_configuration_is_idempotent():
    for _ in range(3):
        create_app(Settings(_env_file=None, app_env="production"))
    handlers = logging.getLogger("provia").handlers
    assert sum(handler.get_name() == "provia-console" for handler in handlers) == 1
    assert logging.getLogger("uvicorn.access").disabled
