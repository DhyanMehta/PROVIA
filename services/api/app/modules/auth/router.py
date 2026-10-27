from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Request, Response
from sqlalchemy import select

from app.core.exceptions import AppError
from app.db.auth_models import AuthSession
from app.db.dependencies import DbSession
from app.modules.auth.dependencies import Identity, client_identity
from app.modules.auth.schemas import (
    AccountOut,
    ActionIn,
    ChangeIn,
    EmailIn,
    LoginIn,
    MessageOut,
    RefreshIn,
    RegisterIn,
    ResetIn,
    SessionOut,
    TokenOut,
)
from app.modules.auth.service import AuthService

router = APIRouter(prefix="/auth", tags=["authentication"])


def service(request, db):
    return AuthService(db, request.app.state.settings, request.app.state.auth_delivery)


def sensitive(response: Response):
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"


@router.post("/register", response_model=MessageOut, status_code=202)
def register(data: RegisterIn, request: Request, db: DbSession, response: Response):
    """Accept an encrypted intent; account creation and email delivery occur later.

    A generic 202 does not establish that the address is eligible, an account exists,
    or an email has been sent. No public delivery-status lookup is provided.
    """
    sensitive(response)
    service(request, db).registration(data, client_identity(request))
    return {
        "message": "If registration can proceed, check your email for verification instructions"
    }


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, request: Request, db: DbSession, response: Response):
    sensitive(response)
    return service(request, db).login(data, client_identity(request))


@router.post("/refresh", response_model=TokenOut)
def refresh(data: RefreshIn, request: Request, db: DbSession, response: Response):
    sensitive(response)
    return service(request, db).refresh(data.refresh_token, client_identity(request))


@router.post("/logout", response_model=MessageOut)
def logout(data: RefreshIn, request: Request, db: DbSession, response: Response):
    sensitive(response)
    service(request, db).logout(data.refresh_token, client_identity(request))
    return {"message": "Signed out"}


@router.get("/me", response_model=AccountOut)
def me(principal: Identity, response: Response):
    sensitive(response)
    return AuthService.public(principal.account)


@router.post("/logout-all", response_model=MessageOut)
def logout_all(principal: Identity, request: Request, db: DbSession, response: Response):
    sensitive(response)
    service(request, db).revoke_all(principal.account.id)
    return {"message": "All sessions revoked"}


@router.post("/resend-verification", response_model=MessageOut, status_code=202)
def resend(data: EmailIn, request: Request, db: DbSession, response: Response):
    """Accept a durable request; eligibility and delivery are evaluated asynchronously."""
    sensitive(response)
    service(request, db).request_action(data.email, "verify_email", client_identity(request))
    return {"message": "If verification is needed, check your email for instructions"}


@router.post("/forgot-password", response_model=MessageOut, status_code=202)
def forgot(data: EmailIn, request: Request, db: DbSession, response: Response):
    """Accept a durable request without confirming account existence or inbox delivery."""
    sensitive(response)
    service(request, db).request_action(data.email, "reset_password", client_identity(request))
    return {"message": "If the account is eligible, check your email for reset instructions"}


@router.post("/verify-email", response_model=MessageOut)
def verify(data: ActionIn, request: Request, db: DbSession, response: Response):
    sensitive(response)
    service(request, db).consume_action(data.token, "verify_email", client_identity(request))
    return {"message": "Email verified. Sign in to continue"}


@router.post("/reset-password", response_model=MessageOut)
def reset(data: ResetIn, request: Request, db: DbSession, response: Response):
    sensitive(response)
    service(request, db).consume_action(
        data.token, "reset_password", client_identity(request), data.new_password
    )
    return {"message": "Password reset. Sign in again"}


@router.post("/change-password", response_model=MessageOut)
def change(
    data: ChangeIn, principal: Identity, request: Request, db: DbSession, response: Response
):
    sensitive(response)
    service(request, db).change_password(principal, data, client_identity(request))
    return {"message": "Password changed. Sign in again"}


@router.get("/sessions", response_model=list[SessionOut])
def sessions(principal: Identity, db: DbSession, response: Response):
    sensitive(response)
    rows = db.scalars(
        select(AuthSession)
        .where(
            AuthSession.account_id == principal.account.id,
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > datetime.now(UTC),
        )
        .order_by(AuthSession.created_at.desc())
        .limit(100)
    )
    return [
        SessionOut(
            id=row.id,
            created_at=row.created_at,
            expires_at=row.expires_at,
            last_used_at=row.last_used_at,
            device_label=row.device_label,
            current=row.id == principal.session.id,
        )
        for row in rows
    ]


@router.delete("/sessions/{session_id}", status_code=204)
def revoke(session_id: UUID, principal: Identity, request: Request, db: DbSession):
    auth = service(request, db)
    auth.account(principal.account.id)
    row = db.scalar(
        select(AuthSession)
        .where(AuthSession.id == session_id, AuthSession.account_id == principal.account.id)
        .with_for_update()
    )
    if not row:
        raise AppError("RESOURCE_NOT_FOUND", "Session not found", 404)
    row.revoked_at = datetime.now(UTC)
    return Response(status_code=204, headers={"Cache-Control": "no-store"})
