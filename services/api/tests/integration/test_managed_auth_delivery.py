"""Exercise the actual lifespan supervisor against disposable PostgreSQL."""

import json
from threading import Event
from uuid import UUID

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import sessionmaker

from app.application import create_app
from app.core.config import Settings
from app.db.auth_models import AuthAccount, AuthAction, AuthEmailJob
from app.db.models import User
from tests.test_first_party_security import TEST_SECRET

pytestmark = pytest.mark.integration


def test_lifespan_worker_delivers_registration_and_joins_on_shutdown(pg_engine):
    delivered = Event()
    messages = []

    class LocalDelivery:
        def available(self):
            pass

        def send(self, email, purpose, token, *, idempotency_key=None):
            messages.append((email, purpose, token, idempotency_key))
            delivered.set()

    settings = Settings(
        _env_file=None,
        app_env="testing",
        auth_jwt_secret=TEST_SECRET,
        auth_email_encryption_keys=json.dumps([Fernet.generate_key().decode()]),
        auth_email_worker_enabled=True,
        auth_email_poll_seconds=1,
    )
    application = create_app(settings)
    sessions = sessionmaker(pg_engine, expire_on_commit=False)
    application.state.database._engine = pg_engine
    application.state.database._sessions = sessions
    application.state.auth_delivery = LocalDelivery()
    email = "managed-worker@example.com"
    password = "A sufficiently long managed test password"

    with TestClient(application) as client:
        supervisor = application.state.auth_email_supervisor
        assert supervisor.thread.is_alive()
        response = client.post(
            "/api/v1/auth/register",
            json={"name": "Managed worker", "email": email, "password": password},
        )
        assert response.status_code == 202
        assert response.headers["cache-control"] == "no-store"
        # No manual claim/drain: the real lifespan-owned thread must find the intent.
        assert delivered.wait(15), "Managed worker did not reach the local provider"
        assert len(messages) == 1
        assert messages[0][:2] == (email, "verify_email")
        with sessions() as db:
            account = db.scalar(select(AuthAccount))
            user_id = account.user_id
            assert db.scalar(select(func.count()).select_from(User)) == 1
            assert db.get(User, user_id) is not None
        verified = client.post("/api/v1/auth/verify-email", json={"token": messages[0][2]})
        assert verified.status_code == 200
        login = client.post("/api/v1/auth/login", json={"email": email, "password": password})
        assert login.status_code == 200
        assert login.json()["user"]["email_verified"] is True
        assert UUID(login.json()["user"]["id"]) == user_id

    assert not supervisor.thread.is_alive()
    assert len(messages) == 1
    with sessions() as db:
        job = db.scalar(select(AuthEmailJob))
        assert job.state == "sent"
        assert job.payload_ciphertext is None
        assert job.claim_token is None and job.claimed_until is None
        assert messages[0][3] == "provia-auth/" + str(job.id)
        assert db.scalar(select(func.count()).select_from(AuthEmailJob)) == 1
        assert db.scalar(select(func.count()).select_from(AuthAccount)) == 1
        assert db.scalar(select(func.count()).select_from(AuthAction)) == 1
        assert db.scalar(select(func.count()).select_from(User)) == 1
        assert db.scalar(select(AuthAccount)).user_id == user_id
