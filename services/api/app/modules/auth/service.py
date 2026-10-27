"""Transactional authentication. Security state is committed before intentional errors."""

import hmac
from datetime import UTC, datetime, timedelta

from sqlalchemy import case, delete, select, update
from sqlalchemy.dialects.postgresql import insert

from app.core.exceptions import AppError
from app.db.auth_models import AuthAccount, AuthAction, AuthRateLimit, AuthRefreshToken, AuthSession
from app.modules.auth.outbox import available_encryption, enqueue_request
from app.modules.auth.schemas import AccountOut, TokenOut
from app.modules.auth.security import (
    HASHER,
    AccessTokens,
    check_password,
    digest,
    dummy_hash,
    hash_password,
    opaque_token,
)


class AuthService:
    def __init__(self, session, settings, delivery):
        self.db, self.settings, self.delivery = session, settings, delivery
        self.tokens = AccessTokens(settings)

    def fail(self, code="INVALID_AUTHENTICATION", message="Authentication failed", status=401):
        # get_db rolls back escaping exceptions. Persist abuse counters and replay
        # revocations explicitly first; a failed commit must remain infrastructure503.
        self.db.commit()
        raise AppError(code, message, status)

    def limit(self, action: str, identity: str, client: str, maximum=10):
        now = datetime.now(UTC)
        self.db.execute(
            delete(AuthRateLimit).where(AuthRateLimit.expires_at < now - timedelta(days=1))
        )
        for kind, value, cap in [("identity", identity, maximum), ("client", client, maximum * 5)]:
            bucket = self.tokens.bucket(action + ":" + kind, value)
            query = insert(AuthRateLimit).values(
                bucket=bucket, attempts=1, expires_at=now + timedelta(minutes=15)
            )
            row = self.db.execute(
                query.on_conflict_do_update(
                    index_elements=[AuthRateLimit.bucket],
                    set_={
                        "attempts": case(
                            (AuthRateLimit.expires_at <= now, 1), else_=AuthRateLimit.attempts + 1
                        ),
                        "expires_at": case(
                            (AuthRateLimit.expires_at <= now, now + timedelta(minutes=15)),
                            else_=AuthRateLimit.expires_at,
                        ),
                    },
                ).returning(AuthRateLimit.attempts)
            ).scalar_one()
            if row > cap:
                self.fail("RATE_LIMITED", "Too many attempts. Try again later", 429)
        self.db.commit()

    def account(self, account_id):
        return self.db.scalar(
            select(AuthAccount)
            .where(AuthAccount.id == account_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )

    @staticmethod
    def public(account):
        return AccountOut(
            id=account.user_id,
            email=account.email,
            name=account.name,
            email_verified=account.email_verified_at is not None,
            status=account.status,
        )

    def registration(self, data, client):
        self.tokens.secret()
        available_encryption(self.settings)
        email = str(data.email)
        self.limit("register", email, client, 5)
        # Hashing and encrypted intent insertion are identical for every address.
        # Account lookup, enrollment and provider latency belong to the worker.
        enqueue_request(
            self.db,
            self.settings,
            "register",
            {
                "email": email,
                "name": data.name,
                "password_hash": hash_password(data.password),
            },
        )

    def issue(self, account, family):
        raw = opaque_token()
        self.db.add(
            AuthRefreshToken(
                session_id=family.id, token_hash=digest(raw), expires_at=family.expires_at
            )
        )
        self.db.flush()
        return TokenOut(
            access_token=self.tokens.issue(account.user_id, family.id),
            refresh_token=raw,
            expires_in=self.settings.auth_access_seconds,
            user=self.public(account),
        )

    def login(self, data, client):
        self.limit("login", str(data.email), client)
        candidate = self.db.scalar(select(AuthAccount).where(AuthAccount.email == str(data.email)))
        encoded = candidate.password_hash if candidate else dummy_hash()
        valid = check_password(encoded, data.password)
        if not valid or not candidate:
            self.fail()
        account = self.account(candidate.id)
        if not hmac.compare_digest(account.password_hash, encoded):
            self.fail()
        if account.status == "disabled":
            self.fail("ACCOUNT_DISABLED", "Account is disabled", 403)
        if HASHER.check_needs_rehash(account.password_hash):
            account.password_hash = hash_password(data.password)
        now = datetime.now(UTC)
        account.last_login_at = now
        family = AuthSession(
            account_id=account.id,
            expires_at=now + timedelta(days=self.settings.auth_refresh_days),
            last_used_at=now,
            device_label=data.device_label,
        )
        self.db.add(family)
        self.db.flush()
        return self.issue(account, family)

    def refresh(self, raw, client):
        self.limit("refresh", digest(raw), client, 30)
        initial = self.db.scalar(
            select(AuthRefreshToken).where(AuthRefreshToken.token_hash == digest(raw))
        )
        family = self.db.get(AuthSession, initial.session_id) if initial else None
        if not family:
            self.fail()
        account = self.account(family.account_id)
        family = self.db.scalar(
            select(AuthSession)
            .where(AuthSession.id == family.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        token = self.db.scalar(
            select(AuthRefreshToken)
            .where(AuthRefreshToken.id == initial.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        now = datetime.now(UTC)
        if token.consumed_at is not None:
            family.revoked_at = now
            self.fail()
        if account.status == "disabled":
            self.fail("ACCOUNT_DISABLED", "Account is disabled", 403)
        if family.revoked_at or family.expires_at <= now or token.expires_at <= now:
            self.fail()
        token.consumed_at = now
        family.last_used_at = now
        return self.issue(account, family)

    def logout(self, raw, client):
        self.limit("logout", client, client, 60)
        token = self.db.scalar(
            select(AuthRefreshToken).where(AuthRefreshToken.token_hash == digest(raw))
        )
        family = self.db.get(AuthSession, token.session_id) if token else None
        if family:
            self.account(family.account_id)
            self.db.execute(
                update(AuthSession)
                .where(AuthSession.id == family.id)
                .values(revoked_at=datetime.now(UTC))
            )

    def revoke_all(self, account_id):
        self.account(account_id)
        self.db.execute(
            update(AuthSession)
            .where(AuthSession.account_id == account_id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )

    def request_action(self, email, purpose, client):
        available_encryption(self.settings)
        self.limit(purpose, str(email), client, 3)
        enqueue_request(self.db, self.settings, purpose, {"email": str(email)})

    def consume_action(self, raw, purpose, client, new_password=None):
        self.limit("consume:" + purpose, client, client, 20)
        initial = self.db.scalar(
            select(AuthAction).where(
                AuthAction.token_hash == digest(raw), AuthAction.purpose == purpose
            )
        )
        if not initial:
            self.fail("INVALID_ACTION", "Link is invalid or expired", 400)
        account = self.account(initial.account_id)
        action = self.db.scalar(
            select(AuthAction)
            .where(AuthAction.id == initial.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        now = datetime.now(UTC)
        if action.consumed_at or action.expires_at <= now or account.status == "disabled":
            self.fail("INVALID_ACTION", "Link is invalid or expired", 400)
        action.consumed_at = now
        if purpose == "verify_email":
            account.email_verified_at, account.status = now, "active"
        else:
            account.password_hash = hash_password(new_password)
            self.db.execute(
                update(AuthAction)
                .where(
                    AuthAction.account_id == account.id,
                    AuthAction.purpose == "reset_password",
                    AuthAction.consumed_at.is_(None),
                )
                .values(consumed_at=now)
            )
            self.revoke_all(account.id)

    def change_password(self, principal, data, client):
        self.limit("change-password", str(principal.account.id), client, 5)
        account = self.account(principal.account.id)
        if not check_password(account.password_hash, data.password):
            self.fail()
        account.password_hash = hash_password(data.new_password)
        self.db.execute(
            update(AuthAction)
            .where(
                AuthAction.account_id == account.id,
                AuthAction.purpose == "reset_password",
                AuthAction.consumed_at.is_(None),
            )
            .values(consumed_at=datetime.now(UTC))
        )
        self.revoke_all(account.id)
