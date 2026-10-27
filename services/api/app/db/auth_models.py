"""First-party identities are explicitly linked to stable application user UUIDs."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models import Created, Identity, Updated


class AuthAccount(Identity, Created, Updated, Base):
    __tablename__ = "auth_accounts"
    __table_args__ = (
        CheckConstraint("status IN ('active','disabled','pending_verification')", name="status"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), unique=True
    )
    email: Mapped[str] = mapped_column(String(320), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(512))
    status: Mapped[str] = mapped_column(String(30), default="pending_verification")
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuthSession(Identity, Created, Base):
    """One login/device family; access tokens bind to this stable session."""

    __tablename__ = "auth_sessions"
    __table_args__ = (Index("ix_auth_sessions_account", "account_id"),)
    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("auth_accounts.id", ondelete="CASCADE")
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    device_label: Mapped[str | None] = mapped_column(String(80))


class AuthRefreshToken(Identity, Created, Base):
    __tablename__ = "auth_refresh_tokens"
    __table_args__ = (Index("ix_auth_refresh_tokens_session", "session_id"),)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("auth_sessions.id", ondelete="CASCADE")
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AuthAction(Identity, Created, Base):
    __tablename__ = "auth_actions"
    __table_args__ = (
        CheckConstraint("purpose IN ('verify_email','reset_password')", name="purpose"),
        Index("ix_auth_actions_account", "account_id"),
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("auth_accounts.id", ondelete="CASCADE")
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    purpose: Mapped[str] = mapped_column(String(30))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuthRateLimit(Base):
    __tablename__ = "auth_rate_limits"
    bucket: Mapped[str] = mapped_column(String(64), primary_key=True)
    attempts: Mapped[int] = mapped_column(Integer)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class AuthEmailJob(Identity, Created, Updated, Base):
    """Private durable intents; recipient and recoverable links are encrypted together."""

    __tablename__ = "auth_email_jobs"
    __table_args__ = (
        CheckConstraint("kind IN ('register','verify_email','reset_password')", name="kind"),
        CheckConstraint(
            "state IN ('queued','processing','retry','sent','cancelled','expired','failed')",
            name="state",
        ),
        CheckConstraint("attempts >= 0 AND attempts <= 4", name="attempts"),
        CheckConstraint("expires_at > created_at", name="expiry"),
        CheckConstraint(
            "(state IN ('queued','processing','retry') AND payload_ciphertext IS NOT NULL) OR "
            "(state IN ('sent','cancelled','expired','failed') AND payload_ciphertext IS NULL)",
            name="payload_state",
        ),
        CheckConstraint(
            "(state = 'processing' AND claimed_until IS NOT NULL AND claim_token IS NOT NULL) OR "
            "(state <> 'processing' AND claimed_until IS NULL AND claim_token IS NULL)",
            name="lease_state",
        ),
        Index("ix_auth_email_jobs_available", "state", "available_at", "created_at"),
        Index("ix_auth_email_jobs_lease", "state", "claimed_until"),
        Index("ix_auth_email_jobs_terminal_updated", "state", "updated_at"),
        Index("ix_auth_email_jobs_request", "request_key", "created_at"),
        Index("ix_auth_email_jobs_action", "action_id"),
    )
    kind: Mapped[str] = mapped_column(String(30))
    request_key: Mapped[str] = mapped_column(String(64))
    payload_ciphertext: Mapped[str | None] = mapped_column(Text)
    action_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("auth_actions.id", ondelete="SET NULL")
    )
    state: Mapped[str] = mapped_column(String(20), default="queued")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    claimed_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    claim_token: Mapped[uuid.UUID | None] = mapped_column()
    last_error: Mapped[str | None] = mapped_column(String(40))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
