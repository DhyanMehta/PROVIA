"""Smoke tests for the API bootstrap."""


def test_health(client) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "provia-api",
        "version": "0.1.0",
    }


def test_swagger_ui(client) -> None:
    response = client.get("/docs")

    assert response.status_code == 200
    assert "swagger-ui" in response.text


def test_readiness(client) -> None:
    response = client.get("/api/v1/health/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "ready", "service": "provia-api"}


def test_openapi(client) -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert {"/api/v1/health", "/api/v1/health/ready", "/api/v1/health/db"} <= set(
        response.json()["paths"]
    )
