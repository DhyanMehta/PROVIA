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
    auth_jwt_secret: SecretStr | None = None
    auth_token_issuer: str = "https://provia-mag7.onrender.com"
    auth_token_audience: str = "provia-mobile"
    auth_access_seconds: int = Field(default=900, ge=60, le=900)
    auth_refresh_days: int = Field(default=30, ge=1, le=30)
    auth_trusted_proxy_cidrs: list[str] = []
    auth_email_provider: Literal["smtp", "resend"] = "smtp"
    # Server-only ordered JSON key ring; first Fernet key encrypts new outbox jobs.
    auth_email_encryption_keys: SecretStr | None = None
    auth_email_requests_enabled: bool = True
    auth_email_worker_enabled: bool = False
    auth_email_poll_seconds: int = Field(default=2, ge=1, le=60)
    resend_api_key: SecretStr | None = None
    resend_from: str | None = None
    smtp_host: str | None = None
    smtp_port: int = Field(default=465, ge=1, le=65535)
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_from: str | None = None
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
