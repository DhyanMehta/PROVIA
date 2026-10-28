import asyncio
import json

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.limits import RequestBodyLimitMiddleware
from app.main import create_app
from scripts.export_openapi import OUTPUT, schema_text


def test_contracts_match_artifact_and_all_owned_routes_require_bearer(application):
    schema = application.openapi()
    assert json.loads(OUTPUT.read_text(encoding="utf-8")) == json.loads(schema_text())
    public = {
        "/api/v1/auth/register",
        "/api/v1/auth/login",
        "/api/v1/auth/refresh",
        "/api/v1/auth/logout",
        "/api/v1/auth/verify-email",
        "/api/v1/auth/resend-verification",
        "/api/v1/auth/forgot-password",
        "/api/v1/auth/reset-password",
        "/api/v1/health",
        "/api/v1/health/ready",
        "/api/v1/health/db",
        "/api/v1/nutrition/calculate-maintenance",
        "/api/v1/nutrition/calculate-goals",
    }
    assert len(schema["paths"]) == 67
    assert {
        "/api/v1/onboarding",
        "/api/v1/weight-logs/latest",
        "/api/v1/weight-logs/{weight_id}",
        "/api/v1/foods/barcode/{barcode}",
        "/api/v1/foods/{food_id}/nutrition",
        "/api/v1/workout-sessions/active",
        "/api/v1/activity",
    } <= schema["paths"].keys()
    assert schema["components"]["securitySchemes"]["HTTPBearer"] == {
        "type": "http",
        "scheme": "bearer",
    }
    operations = []
    for path, methods in schema["paths"].items():
        for operation in methods.values():
            operations.append(operation["operationId"])
            assert bool(operation.get("security")) == (path not in public)
            assert operation["responses"]["422"]["content"]["application/json"]["schema"] == {
                "$ref": "#/components/schemas/ErrorEnvelope"
            }
            for code, response in operation["responses"].items():
                if code == "204":
                    assert "content" not in response
                else:
                    assert response["content"]["application/json"]["schema"]
    assert len(operations) == len(set(operations))
    schemas = schema["components"]["schemas"]
    assert schemas["WaterOut"]["properties"]["amount_ml"]["type"] == "string"
    assert schemas["ActivityOut"]["properties"]["distance_m"]["anyOf"][-1] == {"type": "null"}

    # Every local reference must resolve; this catches broken export/schema wiring.
    def walk(value):
        if isinstance(value, dict):
            if "$ref" in value:
                target = schema
                for part in value["$ref"].removeprefix("#/").split("/"):
                    target = target[part]
            for item in value.values():
                walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)

    walk(schema)


def test_export_ignores_ambient_configuration(monkeypatch):
    expected = schema_text()

    def deny_dotenv(*args, **kwargs):
        raise AssertionError("Contract export must not read dotenv files")

    monkeypatch.setattr(
        "pydantic_settings.sources.providers.dotenv.DotEnvSettingsSource._read_env_file",
        deny_dotenv,
    )
    monkeypatch.setenv("APP_NAME", "unrelated-local-name")
    monkeypatch.setenv("APP_VERSION", "unrelated-local-version")
    monkeypatch.setenv("MAX_REQUEST_BODY_BYTES", "invalid-local-setting")
    assert schema_text() == expected


def test_body_limit_rejects_before_auth_and_keeps_cors_and_request_id():
    app = create_app(Settings(_env_file=None, max_request_body_bytes=1024))
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/water-logs", content=b"x" * 1025, headers={"Origin": "http://localhost:5173"}
        )
        assert response.status_code == 413
        assert response.json()["error"]["code"] == "REQUEST_TOO_LARGE"
        assert response.headers["x-request-id"]
        assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
        assert response.headers["x-content-type-options"] == "nosniff"


def test_body_limit_counts_streamed_bytes_even_when_length_lies():
    async def run(headers, sizes):
        called = []
        messages = [
            {"type": "http.request", "body": b"x" * size, "more_body": index < len(sizes) - 1}
            for index, size in enumerate(sizes)
        ]
        sent = []

        async def receive():
            return messages.pop(0)

        async def send(message):
            sent.append(message)

        async def inner(scope, receive, send):
            called.append(await receive())

        await RequestBodyLimitMiddleware(inner, 8)(
            {"type": "http", "headers": headers}, receive, send
        )
        return called, sent

    for headers in ([], [(b"content-length", b"1")]):
        called, sent = asyncio.run(run(headers, [4, 5]))
        assert not called and sent[0]["status"] == 413
    called, sent = asyncio.run(run([], [4, 4]))
    assert called[0]["body"] == b"xxxxxxxx" and not sent
    for value in (b"-1", b"invalid", b"9" * 5000):
        called, sent = asyncio.run(run([(b"content-length", value)], []))
        assert not called and sent[0]["status"] == 400


def test_structured_logs_are_safe_and_correlated(capsys):
    app = create_app(Settings(_env_file=None))
    with TestClient(app) as client:
        response = client.get(
            "/api/v1/me?token=private-query",
            headers={
                "Authorization": "Basic private-token",
                "Cookie": "private-cookie",
                "X-Request-ID": "private-correlation",
            },
        )
    text = capsys.readouterr().err
    rows = [json.loads(line) for line in text.splitlines()]
    row = next(row for row in rows if row.get("route") in {"/me", "/api/v1/me"})
    assert row["request_id"] == response.headers["x-request-id"]
    assert row["status"] == 401 and row["method"] == "GET"
    assert row["error_category"] == "HTTP_401" and row["duration_ms"] >= 0
    assert "private-" not in text


def test_health_semantics_do_not_hide_database_failure(client):
    assert client.get("/api/v1/health").status_code == 200
    assert client.get("/api/v1/health/ready").status_code == 200  # preserved startup contract
    assert client.get("/api/v1/health/db").status_code == 503  # deployment readiness probe


def test_auth_actions_are_never_exposed_as_public_get_routes(application):
    schema = application.openapi()
    for name in ("verify-email", "reset-password", "refresh", "login"):
        assert "get" not in schema["paths"]["/api/v1/auth/" + name]
