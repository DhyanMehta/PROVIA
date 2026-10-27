"""Durable email invariants on a fresh disposable PostgreSQL schema per test."""

import json
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from threading import Barrier, Event
from types import SimpleNamespace
from uuid import uuid4

import pytest
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import event, func, inspect, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from alembic import command
from app.core.config import Settings
from app.core.exceptions import AppError
from app.db.auth_models import AuthAccount, AuthAction, AuthEmailJob
from app.db.base import Base
from app.db.models import User, WeightLog
from app.modules.auth.outbox import EmailWorker, enqueue_request
from app.modules.auth.security import check_password, digest, hash_password
from tests.test_first_party_security import TEST_SECRET

pytestmark = pytest.mark.integration
PASSWORD = "A long test-only outbox password"


class RecordingDelivery:
    def __init__(self):
        self.calls = []
        self.failures = 0
        self.entered = None
        self.release = None

    def available(self):
        pass

    def send(self, email, purpose, token, **kwargs):
        self.calls.append((email, purpose, token, kwargs))
        if self.entered is not None:
            self.entered.set()
            assert self.release.wait(20), "Test did not release the bounded provider stub"
        if self.failures:
            self.failures -= 1
            raise AppError("EMAIL_UNAVAILABLE", "test-only-private-provider-detail", 503)


@pytest.fixture
def queue(pg_engine):
    key = Fernet.generate_key().decode()
    settings = Settings(
        _env_file=None,
        app_env="testing",
        auth_jwt_secret=TEST_SECRET,
        auth_email_encryption_keys=json.dumps([key]),
    )
    sessions = sessionmaker(pg_engine, expire_on_commit=False)
    database = SimpleNamespace(session=sessions)
    delivery = RecordingDelivery()
    worker = EmailWorker(database, settings, delivery)
    return SimpleNamespace(
        key=key,
        settings=settings,
        sessions=sessions,
        database=database,
        delivery=delivery,
        worker=worker,
        engine=pg_engine,
    )


def enqueue(
    queue,
    kind="register",
    email="queue@example.com",
    now=None,
    name="Queued user",
    password=PASSWORD,
):
    payload = {"email": email}
    if kind == "register":
        payload.update(name=name, password_hash=hash_password(password))
    with queue.sessions() as db, db.begin():
        job = enqueue_request(db, queue.settings, kind, payload, now=now)
        job_id = job.id
    return job_id


def drain(queue, now=None):
    for _ in range(20):
        if not queue.worker.run_once(now=now):
            return
    pytest.fail("Queue did not settle within twenty bounded claims")


def test_outbox_migration_roundtrip_preserves_identity_auth_and_fitness(queue):
    config = Config("alembic.ini")
    now = datetime.now(UTC)
    user_id, weight_id, account_id, action_id = uuid4(), uuid4(), uuid4(), uuid4()
    encoded = hash_password(PASSWORD)
    with queue.sessions() as db, db.begin():
        db.add(User(id=user_id, auth_provider_subject="legacy-outbox", email="old@example.com"))
        db.flush()
        db.add_all(
            [
                WeightLog(id=weight_id, user_id=user_id, weight_kg=Decimal("97"), recorded_at=now),
                AuthAccount(
                    id=account_id,
                    user_id=user_id,
                    email="old@example.com",
                    name="Legacy",
                    password_hash=encoded,
                ),
            ]
        )
        db.flush()
        db.add(
            AuthAction(
                id=action_id,
                account_id=account_id,
                purpose="verify_email",
                token_hash=digest("test-only-existing-action"),
                expires_at=now + timedelta(minutes=30),
            )
        )
    with queue.engine.begin() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "0005")
        assert "auth_email_jobs" not in inspect(connection).get_table_names()
        command.upgrade(config, "0006")
        assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "0006"
    job_id = enqueue(queue, "verify_email", "old@example.com", now)
    with queue.sessions() as db:
        assert db.get(AuthEmailJob, job_id).payload_ciphertext
    with queue.engine.begin() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "0005")
        command.upgrade(config, "0006")
        assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []
    with queue.sessions() as db:
        assert db.get(User, user_id).auth_provider_subject == "legacy-outbox"
        assert db.get(WeightLog, weight_id).weight_kg == Decimal("97")
        assert db.get(AuthAccount, account_id).password_hash == encoded
        assert db.get(AuthAction, action_id).token_hash == digest("test-only-existing-action")
        assert db.scalar(select(func.count()).select_from(AuthEmailJob)) == 0


def test_enqueue_is_atomic_encrypted_and_schema_enforces_job_states(queue):
    now = datetime.now(UTC)
    with pytest.raises(RuntimeError), queue.sessions() as db, db.begin():
        enqueue_request(
            db, queue.settings, "verify_email", {"email": "rollback@example.com"}, now=now
        )
        raise RuntimeError("test-only-rollback")
    with queue.sessions() as db:
        assert db.scalar(select(func.count()).select_from(AuthEmailJob)) == 0
    ids = [
        enqueue(queue, kind, "same@example.com", now)
        for kind in ("register", "verify_email", "reset_password", "register")
    ]
    with queue.sessions() as db, db.begin():
        jobs = [db.get(AuthEmailJob, job_id) for job_id in ids]
        assert len(jobs) == 4 and len({job.id for job in jobs}) == 4
        assert jobs[0].request_key == jobs[3].request_key
        assert len({job.request_key for job in jobs[:3]}) == 3
        assert all(job.state == "queued" for job in jobs)
        assert all("same@example.com" not in job.payload_ciphertext for job in jobs)
        assert all(PASSWORD not in job.payload_ciphertext for job in jobs)
        assert db.scalar(select(func.count()).select_from(AuthAccount)) == 0
        assert db.scalar(select(func.count()).select_from(AuthAction)) == 0
        invalid = [
            {"kind": "unsupported"},
            {"state": "unsupported"},
            {"attempts": -1},
            {"attempts": 5},
            {"payload_ciphertext": None},
            {"action_id": uuid4()},
            {"state": "sent"},
            {"state": "processing"},
            {"claim_token": uuid4()},
            {"expires_at": now - timedelta(seconds=1)},
        ]
        for changes in invalid:
            values = dict(
                kind="verify_email",
                request_key="a" * 64,
                state="queued",
                attempts=0,
                payload_ciphertext=jobs[0].payload_ciphertext,
                created_at=now,
                available_at=now,
                expires_at=now + timedelta(minutes=30),
            )
            values.update(changes)
            with pytest.raises(IntegrityError), db.begin_nested():
                db.add(AuthEmailJob(**values))
                db.flush()
    assert queue.delivery.calls == []


def test_public_known_and_unknown_requests_never_select_accounts_or_send_mail(
    queue, db_application
):
    now = datetime.now(UTC)
    original_hash = hash_password(PASSWORD)
    with queue.sessions() as db, db.begin():
        user = User(auth_provider_subject="known-outbox-user", email="known@example.com")
        db.add(user)
        db.flush()
        db.add(
            AuthAccount(
                user_id=user.id,
                email="known@example.com",
                name="Known",
                password_hash=original_hash,
                status="active",
                email_verified_at=now,
            )
        )
    db_application.state.settings.auth_jwt_secret = SecretStr(TEST_SECRET)
    db_application.state.settings.auth_email_encryption_keys = (
        queue.settings.auth_email_encryption_keys
    )
    db_application.state.settings.auth_email_worker_enabled = False
    db_application.state.auth_delivery = queue.delivery
    selects = []

    def observe(connection, cursor, statement, parameters, context, executemany):
        # Deliberately do not collect bound values: the statement shape is the evidence.
        if statement.lstrip().upper().startswith("SELECT"):
            selects.append(statement.lower())

    event.listen(queue.engine, "before_cursor_execute", observe)
    try:
        with TestClient(db_application) as api:
            for path in ("register", "resend-verification", "forgot-password"):
                results = []
                for email in ("known@example.com", "other@example.com"):
                    payload = {"email": email}
                    if path == "register":
                        payload.update(name="Queued user", password=PASSWORD)
                    response = api.post("/api/v1/auth/" + path, json=payload)
                    assert response.status_code == 202
                    assert response.headers["cache-control"] == "no-store"
                    results.append(response.json())
                assert results[0] == results[1]
    finally:
        event.remove(queue.engine, "before_cursor_execute", observe)
    assert queue.delivery.calls == []
    assert not any("auth_accounts" in statement or "users" in statement for statement in selects)
    with queue.sessions() as db:
        jobs = db.scalars(select(AuthEmailJob)).all()
        assert len(jobs) == 6 and all(job.state == "queued" for job in jobs)
        assert db.scalar(select(func.count()).select_from(AuthAccount)) == 1
        assert db.scalar(select(AuthAccount)).password_hash == original_hash
        assert db.scalar(select(func.count()).select_from(AuthAction)) == 0


def test_claims_are_concurrent_distinct_and_expired_lease_is_fenced(queue):
    now = datetime.now(UTC)
    ids = {
        enqueue(queue, "verify_email", "one@example.com", now),
        enqueue(queue, "verify_email", "two@example.com", now),
    }
    barrier = Barrier(2)

    def claim():
        barrier.wait(timeout=10)
        return queue.worker.claim(now=now)

    with ThreadPoolExecutor(max_workers=2) as executor:
        claims = list(executor.map(lambda _: claim(), range(2)))
    assert {claim[0] for claim in claims} == ids
    assert len({claim[1] for claim in claims}) == 2
    assert queue.worker.claim(now=now + timedelta(seconds=119)) is None
    newer = queue.worker.claim(now=now + timedelta(seconds=121))
    assert newer is not None
    old = next(claim for claim in claims if claim[0] == newer[0])
    assert old[1] != newer[1]
    queue.worker.process_claim(*old, now=now + timedelta(seconds=121))
    with queue.sessions() as db:
        row = db.get(AuthEmailJob, newer[0])
        assert row.state == "processing" and row.claim_token == newer[1] and row.attempts == 2
    queue.worker.process_claim(*newer, now=now + timedelta(seconds=121))
    with queue.sessions() as db:
        row = db.get(AuthEmailJob, newer[0])
        assert row.state == "cancelled" and row.payload_ciphertext is None
        assert row.claim_token is None and row.claimed_until is None
    assert queue.delivery.calls == []


def test_provider_io_releases_locks_and_old_completion_cannot_ack_new_claim(queue):
    now = datetime.now(UTC)
    job_id = enqueue(queue, now=now)
    first = queue.worker.claim(now=now)
    assert first is not None
    entered, release = Event(), Event()
    queue.delivery.entered, queue.delivery.release = entered, release
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(queue.worker.process_claim, *first, now=now)
        try:
            assert entered.wait(10), "Worker did not reach the bounded provider stub"
            with queue.sessions() as db, db.begin():
                job = db.scalar(
                    select(AuthEmailJob)
                    .where(AuthEmailJob.id == job_id)
                    .with_for_update(nowait=True)
                )
                account = db.scalar(select(AuthAccount).with_for_update(nowait=True))
                assert account is not None and job.action_id is not None
                raw = queue.delivery.calls[0][2]
                assert raw not in job.payload_ciphertext
                assert "queue@example.com" not in job.payload_ciphertext
                assert db.get(AuthAction, job.action_id).token_hash == digest(raw)
            replacement = queue.worker.claim(now=now + timedelta(seconds=121))
            assert replacement is not None and replacement[0] == first[0]
            assert replacement[1] != first[1]
        finally:
            release.set()
        future.result(timeout=10)
    with queue.sessions() as db:
        job = db.get(AuthEmailJob, job_id)
        assert job.state == "processing" and job.claim_token == replacement[1]
    queue.delivery.entered = queue.delivery.release = None
    queue.worker.process_claim(*replacement, now=now + timedelta(seconds=121))
    assert len(queue.delivery.calls) == 2
    assert queue.delivery.calls[0][2:] == queue.delivery.calls[1][2:]
    with queue.sessions() as db:
        job = db.get(AuthEmailJob, job_id)
        assert job.state == "sent" and job.payload_ciphertext is None


def test_retry_after_restart_and_key_rotation_reuses_the_same_action(queue, caplog):
    now = datetime.now(UTC)
    job_id = enqueue(queue, now=now)
    queue.delivery.failures = 1
    assert queue.worker.run_once(now=now)
    with queue.sessions() as db:
        job = db.get(AuthEmailJob, job_id)
        assert job.state == "retry" and job.attempts == 1 and job.payload_ciphertext
        action_id = job.action_id
    rotated = queue.settings.model_copy(
        update={
            "auth_email_encryption_keys": SecretStr(
                json.dumps([Fernet.generate_key().decode(), queue.key])
            )
        }
    )
    restarted = EmailWorker(queue.database, rotated, queue.delivery)
    assert restarted.run_once(now=now + timedelta(seconds=59)) is False
    assert restarted.run_once(now=now + timedelta(seconds=60)) is True
    with queue.sessions() as db:
        job = db.get(AuthEmailJob, job_id)
        assert job.state == "sent" and job.action_id == action_id and job.payload_ciphertext is None
        assert db.scalar(select(func.count()).select_from(AuthAction)) == 1
    assert queue.delivery.calls[0][2:] == queue.delivery.calls[1][2:]
    assert "test-only-private-provider-detail" not in caplog.text


def test_preparation_commit_failure_rolls_back_before_delivery_and_recovers(queue):
    now = datetime.now(UTC)
    job_id = enqueue(queue, now=now)
    claimed = queue.worker.claim(now=now)
    assert claimed is not None and claimed[0] == job_id
    with queue.sessions() as db:
        original_ciphertext = db.get(AuthEmailJob, job_id).payload_ciphertext
    failing_sessions = sessionmaker(queue.engine, expire_on_commit=False)

    def fail_commit(session):
        raise SQLAlchemyError("test-only-preparation-commit-failure")

    event.listen(failing_sessions, "before_commit", fail_commit)
    failing_worker = EmailWorker(
        SimpleNamespace(session=failing_sessions), queue.settings, queue.delivery
    )
    try:
        with pytest.raises(SQLAlchemyError, match="test-only-preparation-commit-failure"):
            failing_worker.process_claim(*claimed, now=now)
    finally:
        event.remove(failing_sessions, "before_commit", fail_commit)
    assert queue.delivery.calls == []
    with queue.sessions() as db:
        for model in (User, AuthAccount, AuthAction):
            assert db.scalar(select(func.count()).select_from(model)) == 0
        job = db.get(AuthEmailJob, job_id)
        assert job.payload_ciphertext == original_ciphertext
        assert job.action_id is None and job.state == "processing"
        assert job.claim_token == claimed[1] and job.attempts == 1
    restarted = EmailWorker(queue.database, queue.settings, queue.delivery)
    assert restarted.run_once(now=now + timedelta(seconds=121))
    assert len(queue.delivery.calls) == 1
    with queue.sessions() as db:
        for model in (User, AuthAccount, AuthAction):
            assert db.scalar(select(func.count()).select_from(model)) == 1
        job = db.get(AuthEmailJob, job_id)
        assert job.state == "sent" and job.payload_ciphertext is None and job.attempts == 2


def test_retry_budget_expiration_and_consumed_actions_scrub_secrets(queue):
    now = datetime.now(UTC)
    job_id = enqueue(queue, now=now)
    queue.delivery.failures = 4
    for seconds in (0, 60, 360, 960):
        assert EmailWorker(queue.database, queue.settings, queue.delivery).run_once(
            now=now + timedelta(seconds=seconds)
        )
    with queue.sessions() as db:
        row = db.get(AuthEmailJob, job_id)
        assert row.attempts == 4 and row.state == "failed" and row.payload_ciphertext is None
    assert len(queue.delivery.calls) == 4
    assert queue.worker.run_once(now=now + timedelta(seconds=1100)) is False
    expired = enqueue(queue, "reset_password", "expired@example.com", now)
    queue.worker.run_once(now=now + timedelta(minutes=16))
    with queue.sessions() as db:
        row = db.get(AuthEmailJob, expired)
        assert row.state == "expired" and row.payload_ciphertext is None
    # A delivery retry must recheck a consumed action rather than issue a new token.
    retry_id = enqueue(queue, "verify_email", "queue@example.com", now + timedelta(minutes=17))
    queue.delivery.failures = 1
    queue.worker.run_once(now=now + timedelta(minutes=17))
    with queue.sessions() as db, db.begin():
        row = db.get(AuthEmailJob, retry_id)
        assert row.state == "retry" and row.action_id is not None
        db.get(AuthAction, row.action_id).consumed_at = now + timedelta(minutes=17)
    call_count = len(queue.delivery.calls)
    queue.worker.run_once(now=now + timedelta(minutes=18))
    with queue.sessions() as db:
        row = db.get(AuthEmailJob, retry_id)
        assert row.state == "cancelled" and row.payload_ciphertext is None
    assert len(queue.delivery.calls) == call_count


def test_first_registration_intent_wins_without_password_replacement(queue):
    now = datetime.now(UTC)
    original_password = "Original secure test-only password"
    later_password = "Untrusted later test-only password"
    old = enqueue(queue, now=now, name="Original request", password=original_password)
    new = enqueue(
        queue, now=now + timedelta(seconds=1), name="Later request", password=later_password
    )
    first = queue.worker.claim(now=now + timedelta(seconds=2))
    assert first is not None and first[0] == old
    later = queue.worker.claim(now=now + timedelta(seconds=2))
    if later is not None:
        assert later[0] == new
        queue.worker.process_claim(*later, now=now + timedelta(seconds=2))
    with queue.sessions() as db:
        assert db.get(AuthEmailJob, new).state == "cancelled"
        assert db.scalar(select(func.count()).select_from(AuthAccount)) == 0
    queue.worker.process_claim(*first, now=now + timedelta(seconds=2))
    with queue.sessions() as db:
        assert db.get(AuthEmailJob, old).state == "sent"
        assert db.get(AuthEmailJob, new).state == "cancelled"
        account = db.scalar(select(AuthAccount))
        assert account.name == "Original request"
        assert check_password(account.password_hash, original_password)
        assert not check_password(account.password_hash, later_password)
        assert db.scalar(select(func.count()).select_from(User)) == 1
        assert db.scalar(select(func.count()).select_from(AuthAction)) == 1
    assert len(queue.delivery.calls) == 1


def test_terminal_retention_removes_only_old_job_metadata(queue):
    now = datetime.now(UTC)
    old_id = enqueue(queue, now=now)
    drain(queue, now=now)
    with queue.sessions() as db, db.begin():
        old = db.get(AuthEmailJob, old_id)
        action_id = old.action_id
        account_id = db.scalar(select(AuthAccount.id))
        old.updated_at = now - timedelta(days=8)
        fresh = AuthEmailJob(
            kind="verify_email",
            request_key="b" * 64,
            state="failed",
            attempts=0,
            created_at=now,
            available_at=now,
            expires_at=now + timedelta(minutes=30),
        )
        db.add(fresh)
        db.flush()
        fresh_id = fresh.id
    active_id = enqueue(queue, "verify_email", "unknown@example.com", now)
    claim = queue.worker.claim(now=now)
    assert claim is not None and claim[0] == active_id
    with queue.sessions() as db:
        assert db.get(AuthEmailJob, old_id) is None
        assert db.get(AuthEmailJob, fresh_id) is not None
        assert db.get(AuthEmailJob, active_id).state == "processing"
        assert db.get(AuthAccount, account_id) is not None
        assert db.get(AuthAction, action_id) is not None
        assert db.scalar(select(func.count()).select_from(User)) == 1
