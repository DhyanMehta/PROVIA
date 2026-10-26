"""First-party identities are explicitly linked to stable application user UUIDs."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String
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
