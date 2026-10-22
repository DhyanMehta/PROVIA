import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.main import create_app


def test_factory_without_credentials():
    settings = Settings(_env_file=None)
    assert settings.database_url is None
    assert settings.direct_database_url is None
    first, second = create_app(settings), create_app(settings)
    assert first is not second
    assert first.title == "provia-api"
    assert first.version == "0.1.0"
    with TestClient(first) as client:
        assert client.get("/api/v1/health/ready").status_code == 200


def test_configured_routing():
    settings = Settings(_env_file=None, api_v1_prefix="/custom/v1", app_version="0.2.0")
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/v1/health").status_code == 404
        assert client.get("/custom/v1/health").json()["version"] == "0.2.0"


def test_dotenv_and_environment_precedence(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text('APP_NAME=dotenv-name\nCORS_ORIGINS=["https://example.com"]\n')
    monkeypatch.setenv("APP_NAME", "env-name")
    settings = Settings(_env_file=env_file)
    assert settings.app_name == "env-name"
    assert settings.cors_origins == ["https://example.com"]


def test_cached_settings(monkeypatch):
    monkeypatch.setenv("APP_ENV", "testing")
    assert get_settings() is get_settings()
    assert get_settings().app_env == "testing"


def test_invalid_environment():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, app_env="invalid")


@pytest.mark.parametrize(
    "origin",
    [
        "*",
        "https://*.example.com",
        "https://example.com/path",
        "https://user:password@example.com",
        "null",
        "https://example.com?token=secret",
    ],
)
def test_invalid_cors_origins(origin):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, app_env="production", cors_origins=[origin])


def test_secrets_masked():
    settings = Settings(_env_file=None, database_url="secret-database", usda_api_key="secret-key")
    assert "secret-database" not in repr(settings)
    assert "secret-key" not in settings.model_dump_json()
