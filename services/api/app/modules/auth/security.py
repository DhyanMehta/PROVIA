"""Fixed algorithms and bounded password hashing; never log credential material."""

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from threading import BoundedSemaphore
from uuid import UUID, uuid4

import jwt
from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import HTTPException

from app.core.config import Settings
from app.core.exceptions import AppError

HASHER = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1, type=Type.ID)
HASH_SLOTS = BoundedSemaphore(2)


def hash_password(password: str) -> str:
    if not HASH_SLOTS.acquire(timeout=2):
        raise AppError("AUTH_BUSY", "Try again shortly", 429)
    try:
        return HASHER.hash(password)
    finally:
        HASH_SLOTS.release()


@lru_cache(maxsize=1)
def dummy_hash():
    return hash_password("not-an-account-password")


def check_password(encoded: str, password: str) -> bool:
    if not HASH_SLOTS.acquire(timeout=2):
        raise AppError("AUTH_BUSY", "Try again shortly", 429)
    try:
        return HASHER.verify(encoded, password)
    except (VerificationError, InvalidHashError):
        return False
    finally:
        HASH_SLOTS.release()


def opaque_token() -> str:
    return secrets.token_urlsafe(32)


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class AccessTokens:
    def __init__(self, settings: Settings):
        self.settings = settings

    def secret(self) -> str:
        value = self.settings.auth_jwt_secret
        key = value.get_secret_value() if value else ""
        if len(key.encode()) < 32 or len(set(key)) < 8:
            raise AppError("AUTH_UNAVAILABLE", "Authentication is not configured", 503)
        if not self.settings.auth_token_issuer or not self.settings.auth_token_audience:
            raise AppError("AUTH_UNAVAILABLE", "Authentication is not configured", 503)
        return key

    def bucket(self, purpose: str, identity: str) -> str:
        return hmac.new(
            self.secret().encode(), (purpose + "\x00" + identity).encode(), hashlib.sha256
        ).hexdigest()

    def issue(self, user_id: UUID, session_id: UUID) -> str:
        now = datetime.now(UTC)
        return jwt.encode(
            {
                "sub": str(user_id),
                "sid": str(session_id),
                "jti": str(uuid4()),
                "iss": self.settings.auth_token_issuer,
                "aud": self.settings.auth_token_audience,
                "iat": now,
                "nbf": now,
                "exp": now + timedelta(seconds=self.settings.auth_access_seconds),
                "type": "access",
            },
            self.secret(),
            algorithm="HS256",
            headers={"typ": "JWT"},
        )

    def verify(self, token: str) -> dict:
        key = self.secret()
        try:
            if not isinstance(token, str) or not 1 <= len(token) <= 4096:
                raise ValueError
            claims = jwt.decode(
                token,
                key,
                algorithms=["HS256"],
                issuer=self.settings.auth_token_issuer,
                audience=self.settings.auth_token_audience,
                options={
                    "require": ["sub", "sid", "jti", "iss", "aud", "iat", "nbf", "exp", "type"]
                },
            )
            if claims["type"] != "access":
                raise ValueError
            for name in ("sub", "sid", "jti"):
                if str(UUID(claims[name])) != claims[name]:
                    raise ValueError
            for name in ("iat", "nbf", "exp"):
                if type(claims[name]) is not int:
                    raise ValueError
            if claims["exp"] - claims["iat"] > self.settings.auth_access_seconds:
                raise ValueError
            return claims
        except (jwt.PyJWTError, ValueError, TypeError, OverflowError, AttributeError):
            raise HTTPException(401, headers={"WWW-Authenticate": "Bearer"}) from None
