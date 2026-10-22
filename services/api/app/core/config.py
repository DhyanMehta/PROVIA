"""Environment-based application settings; no external services are initialized."""

from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
    )

    app_name: str = "provia-api"
    app_version: str = "0.1.0"
    app_env: Literal["development", "testing", "staging", "production"] = "development"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"
    cors_origins: list[str] = ["http://localhost:5173"]
    cors_allow_credentials: bool = False
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] | None = None
    database_url: SecretStr | None = None
    direct_database_url: SecretStr | None = None
    auth_issuer: str | None = None
    auth_audience: str | None = None
    auth_jwks_url: str | None = None
    usda_api_key: SecretStr | None = None
    r2_endpoint_url: str | None = None
    r2_access_key_id: SecretStr | None = None
    r2_secret_access_key: SecretStr | None = None
    r2_bucket_name: str | None = None

    @field_validator("api_v1_prefix")
    @classmethod
    def validate_prefix(cls, value: str) -> str:
        if (
            not value.startswith("/")
            or value.endswith("/")
            or any(char in value for char in "?#{} ")
        ):
            raise ValueError("API_V1_PREFIX must be an absolute path without a trailing slash")
        return value

    @field_validator("cors_origins")
    @classmethod
    def validate_origins(cls, values: list[str]) -> list[str]:
        for value in values:
            parsed = urlsplit(value)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.hostname
                or parsed.username is not None
                or parsed.password is not None
                or parsed.path
                or parsed.query
                or parsed.fragment
                or "*" in value
                or any(char.isspace() for char in value)
            ):
                raise ValueError("CORS origins must be explicit HTTP(S) origins without paths")
            # Accessing port also validates malformed port numbers.
            _ = parsed.port
        return values


@lru_cache
def get_settings() -> Settings:
    return Settings()
