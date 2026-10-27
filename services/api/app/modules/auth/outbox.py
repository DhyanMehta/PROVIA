"""Encrypted, transactional auth intents. Only a supervised worker contacts email providers."""

import base64
import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from sqlalchemy import and_, delete, func, or_, select, text, update

from app.core.exceptions import AppError
from app.db.auth_models import AuthAccount, AuthAction, AuthEmailJob
from app.db.models import User
from app.modules.auth.security import AccessTokens, digest, opaque_token

ACTIVE = ("queued", "processing", "retry")
KINDS = ("register", "verify_email", "reset_password")
MAX_ATTEMPTS = 4
LEASE_SECONDS = 120
RETRY_SECONDS = (60, 300, 600)


def available_encryption(settings):
    """Independent server-only keys; newest first, with old keys retained while jobs live."""
    try:
        secret = settings.auth_email_encryption_keys
        raw = secret.get_secret_value() if secret else ""
        if len(raw) > 512:
            raise ValueError
        keys = json.loads(raw) if raw else None
        if not isinstance(keys, list) or not 1 <= len(keys) <= 3:
            raise ValueError
        if any(not isinstance(key, str) for key in keys) or len(set(keys)) != len(keys):
            raise ValueError
        jwt_secret = settings.auth_jwt_secret
        signing_key = jwt_secret.get_secret_value().encode() if jwt_secret else b""
        if any(
            key.encode("ascii") == signing_key
            or base64.urlsafe_b64decode(key.encode("ascii")) == signing_key
            for key in keys
        ):
            raise ValueError
        return MultiFernet([Fernet(key.encode("ascii")) for key in keys])
    except (ValueError, TypeError, UnicodeError, AttributeError):
        raise AppError("EMAIL_UNAVAILABLE", "Email requests are not configured", 503) from None


def encrypt_payload(settings, job_id, kind, data):
    envelope = {"version": 1, "job_id": str(job_id), "kind": kind, "data": data}
    return available_encryption(settings).encrypt(json.dumps(envelope).encode()).decode("ascii")


def decrypt_payload(settings, job_id, kind, ciphertext):
    try:
        result = json.loads(available_encryption(settings).decrypt(ciphertext.encode("ascii")))
        if (
            not isinstance(result, dict)
            or result.get("version") != 1
            or result.get("job_id") != str(job_id)
            or result.get("kind") != kind
            or not isinstance(result.get("data"), dict)
        ):
            raise ValueError
        return result["data"]
    except (InvalidToken, ValueError, TypeError, UnicodeError, AttributeError):
        raise AppError("INVALID_EMAIL_PAYLOAD", "Email request cannot be recovered", 503) from None


def enqueue_request(db, settings, kind, payload, now=None):
    """Same insert path for every address; eligibility is deliberately deferred."""
    if not settings.auth_email_requests_enabled:
        raise AppError("EMAIL_UNAVAILABLE", "Email requests are temporarily paused", 503)
    if kind not in KINDS:
        raise ValueError("Unsupported email intent")
    now = now or datetime.now(UTC)
    job_id = uuid4()
    job = AuthEmailJob(
        id=job_id,
        kind=kind,
        request_key=AccessTokens(settings).bucket("email-intent:" + kind, payload["email"]),
        payload_ciphertext=encrypt_payload(settings, job_id, kind, payload),
        state="queued",
        attempts=0,
        available_at=now,
        expires_at=now + timedelta(minutes=15 if kind == "reset_password" else 30),
        created_at=now,
        updated_at=now,
    )
    db.add(job)
    db.flush()
    return job


def terminal(job, state, reason=None, now=None):
    job.state, job.last_error = state, reason
    job.payload_ciphertext = None
    job.claim_token = job.claimed_until = None
    job.updated_at = now or datetime.now(UTC)


class EmailWorker:
    """Finite durable work units; lifespan supervision is owned by the application."""

    def __init__(self, database, settings, delivery):
        self.database, self.settings, self.delivery = database, settings, delivery

    def claim(self, now=None):
        available_encryption(self.settings)
        now = now or datetime.now(UTC)
        with self.database.session() as db, db.begin():
            stale = list(
                db.scalars(
                    select(AuthEmailJob.id)
                    .where(
                        AuthEmailJob.state.not_in(ACTIVE),
                        AuthEmailJob.updated_at < now - timedelta(days=7),
                    )
                    .order_by(AuthEmailJob.updated_at, AuthEmailJob.id)
                    .with_for_update(skip_locked=True)
                    .limit(100)
                )
            )
            if stale:
                db.execute(delete(AuthEmailJob).where(AuthEmailJob.id.in_(stale)))
            for _ in range(10):
                job = db.scalar(
                    select(AuthEmailJob)
                    .where(
                        AuthEmailJob.state.in_(ACTIVE),
                        or_(
                            AuthEmailJob.expires_at <= now,
                            and_(
                                AuthEmailJob.state.in_(("queued", "retry")),
                                AuthEmailJob.available_at <= now,
                            ),
                            and_(
                                AuthEmailJob.state == "processing",
                                AuthEmailJob.claimed_until <= now,
                            ),
                        ),
                    )
                    .order_by(AuthEmailJob.created_at, AuthEmailJob.id)
                    .with_for_update(skip_locked=True)
                    .limit(1)
                )
                if job is None:
                    return None
                if job.expires_at <= now:
                    terminal(job, "expired", "EXPIRED", now)
                    db.flush()
                    continue
                if job.attempts >= MAX_ATTEMPTS:
                    terminal(job, "failed", "ATTEMPTS_EXHAUSTED", now)
                    db.flush()
                    continue
                job.state, job.claim_token = "processing", uuid4()
                job.claimed_until = now + timedelta(seconds=LEASE_SECONDS)
                job.attempts += 1
                job.updated_at = now
                db.flush()
                return job.id, job.claim_token
        return None

    @staticmethod
    def owned(job, claim_token, now):
        return (
            job is not None
            and job.state == "processing"
            and job.claim_token == claim_token
            and job.claimed_until > now
        )

    def _prepare(self, job_id, claim_token, now=None):
        fixed_now = now
        now = now or datetime.now(UTC)
        with self.database.session() as db, db.begin():
            initial = db.get(AuthEmailJob, job_id)
            if not self.owned(initial, claim_token, now):
                return None
            try:
                payload = decrypt_payload(
                    self.settings, initial.id, initial.kind, initial.payload_ciphertext
                )
                email = payload["email"]
                if not isinstance(email, str) or not 1 <= len(email) <= 320:
                    raise ValueError
            except (AppError, KeyError, ValueError):
                locked = db.scalar(
                    select(AuthEmailJob).where(AuthEmailJob.id == job_id).with_for_update()
                )
                checked_at = fixed_now or datetime.now(UTC)
                if self.owned(locked, claim_token, checked_at):
                    terminal(locked, "failed", "INVALID_PAYLOAD", checked_at)
                return None
            # Serialize even absent account keys. All worker paths acquire this
            # advisory lock before account/job locks, preventing lock-order cycles.
            key = int(digest(email)[:16], 16)
            if key >= 2**63:
                key -= 2**64
            db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})
            account = db.scalar(
                select(AuthAccount).where(AuthAccount.email == email).with_for_update()
            )
            job = db.scalar(
                select(AuthEmailJob)
                .where(AuthEmailJob.id == job_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
            now = fixed_now or datetime.now(UTC)
            if not self.owned(job, claim_token, now):
                return None
            if job.expires_at <= now:
                terminal(job, "expired", "EXPIRED", now)
                return None
            # Registration preserves the earliest accepted intent's password.
            # Recovery/resend use the newest request. Prepared deliveries retain
            # their exact token and idempotency key through retries.
            if job.action_id is None:
                if "token" in payload or "purpose" in payload:
                    terminal(job, "cancelled", "ACTION_INVALID", now)
                    return None
                later = or_(
                    AuthEmailJob.created_at > job.created_at,
                    and_(AuthEmailJob.created_at == job.created_at, AuthEmailJob.id > job.id),
                )
                earlier = or_(
                    AuthEmailJob.created_at < job.created_at,
                    and_(AuthEmailJob.created_at == job.created_at, AuthEmailJob.id < job.id),
                )
                ordering = earlier if job.kind == "register" else later
                other_conditions = [ordering]
                if job.kind == "register":
                    other_conditions.extend(
                        [
                            AuthEmailJob.state.in_(ACTIVE),
                            AuthEmailJob.expires_at > now,
                        ]
                    )
                superseding = db.scalar(
                    select(AuthEmailJob.id)
                    .where(
                        AuthEmailJob.request_key == job.request_key,
                        *other_conditions,
                    )
                    .limit(1)
                )
                if superseding:
                    terminal(job, "cancelled", "SUPERSEDED", now)
                    return None
            purpose = "verify_email" if job.kind == "register" else job.kind
            if job.kind == "register" and job.action_id is None:
                legacy = db.scalar(
                    select(User.id)
                    .where(
                        func.lower(User.email) == email,
                        ~select(AuthAccount.id).where(AuthAccount.user_id == User.id).exists(),
                    )
                    .limit(1)
                )
                if account is not None or legacy is not None:
                    terminal(job, "cancelled", "INELIGIBLE", now)
                    return None
                name, password_hash = payload.get("name"), payload.get("password_hash")
                if (
                    not isinstance(name, str)
                    or not 1 <= len(name) <= 100
                    or not isinstance(password_hash, str)
                    or len(password_hash) > 512
                    or not password_hash.startswith("$argon2id$")
                ):
                    terminal(job, "failed", "INVALID_PAYLOAD", now)
                    return None
                user_id = uuid4()
                db.add(
                    User(id=user_id, auth_provider_subject="provia:" + str(user_id), email=email)
                )
                db.flush()
                account = AuthAccount(
                    user_id=user_id, email=email, name=name, password_hash=password_hash
                )
                db.add(account)
                db.flush()
            if (
                account is None
                or account.status == "disabled"
                or (purpose == "verify_email" and account.email_verified_at is not None)
            ):
                terminal(job, "cancelled", "INELIGIBLE", now)
                return None
            if job.action_id is None:
                db.execute(
                    update(AuthAction)
                    .where(
                        AuthAction.account_id == account.id,
                        AuthAction.purpose == purpose,
                        AuthAction.consumed_at.is_(None),
                    )
                    .values(consumed_at=now)
                )
                raw = opaque_token()
                action = AuthAction(
                    account_id=account.id,
                    token_hash=digest(raw),
                    purpose=purpose,
                    expires_at=job.expires_at,
                )
                db.add(action)
                db.flush()
                job.action_id = action.id
                payload = {"email": email, "purpose": purpose, "token": raw}
                job.payload_ciphertext = encrypt_payload(self.settings, job.id, job.kind, payload)
            else:
                action = db.get(AuthAction, job.action_id)
                if (
                    action is None
                    or action.account_id != account.id
                    or action.purpose != purpose
                    or action.consumed_at is not None
                    or action.expires_at <= now
                    or payload.get("purpose") != purpose
                    or not isinstance(payload.get("token"), str)
                    or digest(payload["token"]) != action.token_hash
                ):
                    terminal(job, "cancelled", "ACTION_INVALID", now)
                    return None
            # Snapshot after commit; no DB connection/transaction spans provider I/O.
            return (
                payload["email"],
                payload["purpose"],
                payload["token"],
                job.expires_at,
                job.claimed_until,
            )

    def _finish(self, job_id, claim_token, now, success, retryable=True):
        with self.database.session() as db, db.begin():
            job = db.scalar(select(AuthEmailJob).where(AuthEmailJob.id == job_id).with_for_update())
            now = now or datetime.now(UTC)
            if not self.owned(job, claim_token, now):
                return
            if success:
                job.sent_at = now
                terminal(job, "sent", now=now)
            elif job.expires_at <= now:
                terminal(job, "expired", "EXPIRED", now)
            elif not retryable:
                terminal(job, "failed", "DELIVERY_REJECTED", now)
            elif job.attempts >= MAX_ATTEMPTS:
                terminal(job, "failed", "DELIVERY_UNCONFIRMED", now)
            else:
                job.state, job.last_error = "retry", "DELIVERY_UNCONFIRMED"
                job.available_at = min(
                    now + timedelta(seconds=RETRY_SECONDS[job.attempts - 1]), job.expires_at
                )
                job.claimed_until = job.claim_token = None
                job.updated_at = now

    def process_claim(self, job_id, claim_token, now=None):
        prepared = self._prepare(job_id, claim_token, now)
        if prepared is None:
            return
        current = now or datetime.now(UTC)
        if current >= prepared[3] or current >= prepared[4]:
            self._finish(job_id, claim_token, now, False)
            return
        success, retryable = False, True
        try:
            self.delivery.send(*prepared[:3], idempotency_key="provia-auth/" + str(job_id))
            success = True
        except Exception as error:
            # Persist only a static category, never provider errors/recipient/token.
            retryable = getattr(error, "retryable", True) is not False
        self._finish(job_id, claim_token, now, success, retryable)

    def run_once(self, now=None):
        claimed = self.claim(now)
        if claimed is None:
            return False
        self.process_claim(*claimed, now=now)
        return True
