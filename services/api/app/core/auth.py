"""Provider-neutral OIDC JWT verification. Only configured RS256 keys are trusted."""

from threading import Lock
from typing import Annotated
from urllib.parse import urlsplit

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings
from app.core.exceptions import AppError
from app.db.dependencies import DbSession
from app.db.models import User
from app.modules.users.repository import UserRepository
from app.modules.users.service import UserService

bearer = HTTPBearer(auto_error=False)


def unauthorized() -> HTTPException:
    return HTTPException(401, headers={"WWW-Authenticate": "Bearer"})


class TokenVerifier:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._client = None
        self._lock = Lock()

    def verify(self, token: str) -> dict:
        settings = self.settings
        if not all([settings.auth_issuer, settings.resolved_jwks_url]):
            raise AppError("AUTH_UNAVAILABLE", "Authentication is not configured", 503)
        parsed = urlsplit(settings.resolved_jwks_url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise AppError("AUTH_UNAVAILABLE", "Authentication configuration is invalid", 503)
        try:
            header = jwt.get_unverified_header(token)
            if header.get("alg") != "RS256" or not isinstance(header.get("kid"), str):
                raise unauthorized()
            if not header["kid"] or len(header["kid"]) > 200 or len(token) > 16384:
                raise unauthorized()
            with self._lock:
                if self._client is None:
                    self._client = jwt.PyJWKClient(
                        settings.resolved_jwks_url, timeout=5, lifespan=300, cache_keys=False
                    )
                key = self._client.get_signing_key(header["kid"])
            if key.algorithm_name != "RS256":
                raise unauthorized()
            claims = jwt.decode(
                token,
                key.key,
                algorithms=["RS256"],
                issuer=settings.auth_issuer,
                audience=settings.auth_audience,
                options={
                    "require": ["exp", "iss", "sub"] + (["aud"] if settings.auth_audience else []),
                    "verify_aud": bool(settings.auth_audience),
                },
            )
            if not isinstance(claims["sub"], str) or not 1 <= len(claims["sub"]) <= 255:
                raise unauthorized()
            party = claims.get("azp")
            if party is not None and (
                not isinstance(party, str) or party not in settings.auth_authorized_parties
            ):
                raise unauthorized()
            if party is None and settings.auth_require_authorized_party:
                raise unauthorized()
            if claims.get("sts") == "pending":
                raise HTTPException(403)
            return claims
        except jwt.PyJWKClientConnectionError:
            raise AppError("AUTH_UNAVAILABLE", "Identity provider is unavailable", 503) from None
        except (jwt.PyJWTError, ValueError, TypeError):
            raise unauthorized() from None


def verify_identity(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> dict:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized()
    return request.app.state.token_verifier.verify(credentials.credentials)


def get_current_user(claims: Annotated[dict, Depends(verify_identity)], session: DbSession) -> User:
    return UserService(UserRepository(session)).resolve(claims)


CurrentUser = Annotated[User, Depends(get_current_user, scope="function")]
