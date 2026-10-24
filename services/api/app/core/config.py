"""Environment-based application settings; no external services are initialized."""

from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator
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
    max_request_body_bytes: int = Field(default=16 * 1024 * 1024, ge=1024, le=64 * 1024 * 1024)
    api_v1_prefix: str = "/api/v1"
    cors_origins: list[str] = ["http://localhost:5173"]
    cors_allow_credentials: bool = False
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] | None = None
    database_url: SecretStr | None = None
    direct_database_url: SecretStr | None = None
    auth_issuer: str | None = None
    auth_audience: str | None = None
    auth_jwks_url: str | None = None
    auth_authorized_parties: list[str] = ["http://localhost:5173"]
    auth_require_authorized_party: bool = False
    nutrition_min_daily_calories: Decimal = Field(default=Decimal("1500"), ge=1200, le=5000)
    usda_api_key: SecretStr | None = None
    food_http_timeout_seconds: float = Field(default=5, gt=0, le=30)
    food_provider_cache_seconds: int = Field(default=300, ge=0, le=3600)
    food_provider_stale_seconds: int = Field(default=3600, ge=0, le=86400)
    food_provider_min_interval_seconds: float = Field(default=6, ge=0, le=60)
    off_user_agent: str = "PROVIA/0.1.0 (local development)"
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

    @field_validator("cors_origins", "auth_authorized_parties")
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

    @property
    def resolved_jwks_url(self) -> str | None:
        if self.auth_jwks_url:
            return self.auth_jwks_url
        issuer = urlsplit(self.auth_issuer or "")
        if issuer.scheme == "https" and (issuer.hostname or "").endswith(".clerk.accounts.dev"):
            return self.auth_issuer.rstrip("/") + "/.well-known/jwks.json"
        return None


@lru_cache
def get_settings() -> Settings:
    return Settings()
