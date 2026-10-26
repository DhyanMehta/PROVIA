"""Opt-in PostgreSQL tests. Each test owns a fresh, randomly named schema."""

import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.config import Config
from dotenv import dotenv_values
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from alembic import command
from app.db.auth_models import AuthAccount, AuthSession
from app.db.models import User
from app.db.session import postgres_url
from app.modules.auth.security import AccessTokens, hash_password
from tests.test_first_party_security import TEST_SECRET


@pytest.fixture
def pg_engine():
    local = dotenv_values(Path(__file__).resolve().parents[2] / ".env")
    raw_url = os.environ.get("TEST_DATABASE_URL") or local.get("TEST_DATABASE_URL")
    consent = os.environ.get("TEST_DATABASE_DISPOSABLE") or local.get("TEST_DATABASE_DISPOSABLE")
    if not raw_url or str(consent).lower() != "true":
        pytest.skip("Dedicated TEST_DATABASE_URL and TEST_DATABASE_DISPOSABLE=true required")
    schema = "provia_test_" + uuid4().hex
    admin = create_engine(
        postgres_url(raw_url, direct=True),
        poolclass=NullPool,
        hide_parameters=True,
        connect_args={"connect_timeout": 5},
    )
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(
        postgres_url(raw_url, direct=True),
        hide_parameters=True,
        connect_args={"connect_timeout": 5, "options": f"-c search_path={schema} -c timezone=UTC"},
    )
    try:
        with engine.begin() as connection:
            config = Config("alembic.ini")
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
        yield engine
    finally:
        engine.dispose()
        # Only the generated schema above is removed, never an existing schema/database.
        assert schema.startswith("provia_test_") and len(schema) == 44
        with admin.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        admin.dispose()


@pytest.fixture
def db_application(application, pg_engine):
    application.state.database._engine = pg_engine
    application.state.database._sessions = sessionmaker(pg_engine, expire_on_commit=False)
    return application


@pytest.fixture
def authenticated_client(db_application, pg_engine):
    db_application.state.settings.auth_jwt_secret = SecretStr(TEST_SECRET)
    signer = AccessTokens(db_application.state.settings)
    identities = {}

    def headers(subject="user-a"):
        if subject not in identities:
            now = datetime.now(UTC)
            with Session(pg_engine) as db:
                user = User(auth_provider_subject=subject)
                db.add(user)
                db.flush()
                account = AuthAccount(
                    user_id=user.id,
                    email=subject + "@example.com",
                    name="Integration test",
                    password_hash=hash_password("integration-test-password"),
                    status="active",
                    email_verified_at=now,
                )
                db.add(account)
                db.flush()
                family = AuthSession(
                    account_id=account.id, expires_at=now + timedelta(days=30), last_used_at=now
                )
                db.add(family)
                db.flush()
                identities[subject] = (user.id, family.id)
                db.commit()
        token = signer.issue(*identities[subject])
        return {"Authorization": "Bearer " + token}

    with TestClient(db_application) as api:
        yield api, headers
