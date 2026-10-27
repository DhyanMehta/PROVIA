import base64
import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from cryptography.fernet import Fernet
from pydantic import SecretStr

from app.core.config import Settings
from app.core.exceptions import AppError
from app.modules.auth.outbox import (
    EmailWorker,
    available_encryption,
    decrypt_payload,
    encrypt_payload,
    enqueue_request,
)
from app.modules.auth.schemas import RegisterIn
from app.modules.auth.security import AccessTokens
from app.modules.auth.service import AuthService
from tests.test_first_party_security import TEST_SECRET

TEST_EMAIL_KEY = base64.urlsafe_b64encode(b"test-only-outbox-key".ljust(32, b"!")).decode()


def configured(*keys):
    return Settings(
        _env_file=None,
        auth_jwt_secret=TEST_SECRET,
        auth_email_encryption_keys=json.dumps(list(keys or [TEST_EMAIL_KEY])),
    )


def test_encrypted_job_envelope_hides_and_binds_recoverable_action_data():
    settings = configured()
    job_id = uuid4()
    data = {"email": "private@example.com", "token": "test-only-opaque-token"}
    ciphertext = encrypt_payload(settings, job_id, "verify_email", data)
    assert all(value not in ciphertext for value in data.values())
    assert decrypt_payload(settings, job_id, "verify_email", ciphertext) == data
    for other_id, kind in [(uuid4(), "verify_email"), (job_id, "reset_password")]:
        with pytest.raises(AppError):
            decrypt_payload(settings, other_id, kind, ciphertext)
    with pytest.raises(AppError):
        decrypt_payload(settings, job_id, "verify_email", ciphertext[:-4] + "xxxx")


@pytest.mark.parametrize("raw", [None, "[]", "{}", '["invalid"]', "[1]", '"private-key"'])
def test_invalid_key_configuration_is_fail_closed_and_sanitized(raw):
    settings = SimpleNamespace(auth_email_encryption_keys=SecretStr(raw) if raw else None)
    with pytest.raises(AppError) as error:
        available_encryption(settings)
    assert error.value.code == "EMAIL_UNAVAILABLE"
    assert "private-key" not in str(error.value)


def test_key_rotation_reads_old_payload_and_encrypts_with_new_primary():
    old = TEST_EMAIL_KEY
    new = Fernet.generate_key().decode()
    job_id = uuid4()
    ciphertext = encrypt_payload(configured(old), job_id, "reset_password", {"email": "a@b.com"})
    assert (
        decrypt_payload(configured(new, old), job_id, "reset_password", ciphertext)["email"]
        == "a@b.com"
    )
    fresh = encrypt_payload(configured(new, old), job_id, "reset_password", {"email": "a@b.com"})
    assert json.loads(Fernet(new.encode()).decrypt(fresh.encode()))["job_id"] == str(job_id)
    with pytest.raises(AppError):
        decrypt_payload(configured(new), job_id, "reset_password", ciphertext)


def test_enqueue_flushes_without_committing_and_has_only_encrypted_recipient():
    db = MagicMock()
    now = datetime.now(UTC)
    job = enqueue_request(db, configured(), "reset_password", {"email": "private@example.com"}, now)
    assert job.expires_at == now + timedelta(minutes=15)
    assert job.request_key == AccessTokens(configured()).bucket(
        "email-intent:reset_password", "private@example.com"
    )
    assert "private@example.com" not in job.payload_ciphertext
    db.flush.assert_called_once()
    db.commit.assert_not_called()


@pytest.mark.parametrize("method", ["register", "verify_email", "reset_password"])
def test_public_request_paths_never_lookup_accounts_or_contact_provider(method, monkeypatch):
    db, delivery = MagicMock(), MagicMock()
    db.scalar.side_effect = AssertionError("Public request must not query account existence")
    delivery.available.side_effect = AssertionError("Provider readiness cannot branch public work")
    delivery.send.side_effect = AssertionError("Provider latency cannot affect public response")
    service = AuthService(db, configured(), delivery)
    service.limit = MagicMock()
    if method == "register":
        from app.modules.auth import service as module

        hashes = MagicMock(return_value="$argon2id$test-only-hash")
        monkeypatch.setattr(module, "hash_password", hashes)
        for email in ["known@example.com", "unknown@example.com"]:
            service.registration(
                RegisterIn(name="Person", email=email, password="A long password"), "peer"
            )
        assert hashes.call_count == 2
    else:
        for email in ["known@example.com", "unknown@example.com"]:
            service.request_action(email, method, "peer")
    assert db.add.call_count == db.flush.call_count == 2
    db.scalar.assert_not_called()
    delivery.available.assert_not_called()
    delivery.send.assert_not_called()


def test_worker_fencing_and_deadline_guards():
    now, token = datetime.now(UTC), uuid4()
    job = SimpleNamespace(
        state="processing", claim_token=token, claimed_until=now + timedelta(seconds=1)
    )
    assert EmailWorker.owned(job, token, now)
    assert not EmailWorker.owned(job, uuid4(), now)
    assert not EmailWorker.owned(job, token, now + timedelta(seconds=1))
    job.state = "sent"
    assert not EmailWorker.owned(job, token, now)


def test_paused_intake_leaves_worker_crypto_available_and_performs_no_database_work():
    settings = configured()
    settings.auth_email_requests_enabled = False
    db = MagicMock()
    assert available_encryption(settings) is not None
    with pytest.raises(AppError) as error:
        enqueue_request(db, settings, "reset_password", {"email": "person@example.com"})
    assert error.value.code == "EMAIL_UNAVAILABLE" and error.value.status_code == 503
    assert db.mock_calls == []


@pytest.mark.parametrize("decoded", [False, True])
def test_email_encryption_key_must_not_reuse_jwt_signing_material(decoded):
    settings = configured()
    signing_key = base64.urlsafe_b64decode(TEST_EMAIL_KEY).decode() if decoded else TEST_EMAIL_KEY
    settings.auth_jwt_secret = SecretStr(signing_key)
    with pytest.raises(AppError) as error:
        available_encryption(settings)
    assert error.value.code == "EMAIL_UNAVAILABLE"


def test_keyring_configuration_size_is_bounded():
    settings = configured()
    settings.auth_email_encryption_keys = SecretStr(" " * 513 + json.dumps([TEST_EMAIL_KEY]))
    with pytest.raises(AppError):
        available_encryption(settings)


def test_completion_rechecks_real_clock_after_waiting_for_database_lock(monkeypatch):
    from app.modules.auth import outbox

    started, token, job_id = datetime.now(UTC), uuid4(), uuid4()
    clock = [started]
    job = SimpleNamespace(
        state="processing",
        claim_token=token,
        claimed_until=started + timedelta(seconds=1),
        sent_at=None,
        payload_ciphertext="encrypted-test-payload",
    )
    database = MagicMock()
    db = database.session.return_value.__enter__.return_value

    def locked_row(*args):
        clock[0] = started + timedelta(seconds=2)
        return job

    db.scalar.side_effect = locked_row
    monkeypatch.setattr(outbox, "datetime", SimpleNamespace(now=lambda timezone: clock[0]))
    worker = EmailWorker(database, configured(), MagicMock())
    worker._prepare = MagicMock(
        return_value=(
            "person@example.com",
            "verify_email",
            "test-only-token",
            started + timedelta(minutes=30),
            job.claimed_until,
        )
    )
    worker.process_claim(job_id, token)
    assert job.state == "processing" and job.sent_at is None
    assert job.payload_ciphertext == "encrypted-test-payload"
