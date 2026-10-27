from dataclasses import dataclass
from datetime import UTC, datetime
from ipaddress import ip_address, ip_network
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select

from app.core.exceptions import AppError
from app.db.auth_models import AuthAccount, AuthSession
from app.db.dependencies import DbSession
from app.db.models import User
from app.modules.auth.security import AccessTokens

bearer = HTTPBearer(auto_error=False)


@dataclass
class Principal:
    account: AuthAccount
    session: AuthSession
    user: User


def verify_access(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> dict:
    if (
        len(request.headers.getlist("authorization")) != 1
        or not credentials
        or credentials.scheme.lower() != "bearer"
        or any(char.isspace() for char in credentials.credentials)
    ):
        raise HTTPException(401, headers={"WWW-Authenticate": "Bearer"})
    return AccessTokens(request.app.state.settings).verify(credentials.credentials)


def identity(
    request: Request,
    claims: Annotated[dict, Depends(verify_access)],
    db: DbSession,
) -> Principal:
    row = db.execute(
        select(AuthAccount, AuthSession, User)
        .join(User, User.id == AuthAccount.user_id)
        .join(AuthSession, AuthSession.account_id == AuthAccount.id)
        .where(User.id == UUID(claims["sub"]), AuthSession.id == UUID(claims["sid"]))
    ).one_or_none()
    if not row or row[1].revoked_at or row[1].expires_at <= datetime.now(UTC):
        raise HTTPException(401, headers={"WWW-Authenticate": "Bearer"})
    if row[0].status == "disabled":
        raise AppError("ACCOUNT_DISABLED", "Account is disabled", 403)
    return Principal(*row)


Identity = Annotated[Principal, Depends(identity)]


def verified_user(principal: Identity):
    if not principal.account.email_verified_at or principal.account.status != "active":
        raise AppError("EMAIL_NOT_VERIFIED", "Verify your email before continuing", 403)
    return principal.user


def client_identity(request: Request) -> str:
    peer = request.client.host if request.client else "unknown"
    try:
        trusted = [
            ip_network(value) for value in request.app.state.settings.auth_trusted_proxy_cidrs
        ]
        if not any(ip_address(peer) in network for network in trusted):
            return peer
        forwarded = request.headers.getlist("x-forwarded-for")
        # A proxy may append a second field without replacing an attacker-controlled
        # first field. Reject that ambiguity rather than choosing either identity.
        if len(forwarded) != 1:
            return peer
        chain = forwarded[0].split(",")
        if not 1 <= len(chain) <= 5:
            return peer
        for item in reversed(chain):
            candidate = ip_address(item.strip())
            if not any(candidate in network for network in trusted):
                return str(candidate)
    except ValueError:
        pass
    return peer
