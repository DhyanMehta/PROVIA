"""Opt-in PostgreSQL tests. Each test owns a fresh, randomly named schema."""

import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import jwt
import pytest
from alembic.config import Config
from cryptography.hazmat.primitives.asymmetric import rsa
from dotenv import dotenv_values
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from alembic import command
from app.core.auth import TokenVerifier
from app.core.config import Settings
from app.db.session import postgres_url


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
def authenticated_client(db_application):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    verifier = TokenVerifier(
        Settings(
            _env_file=None,
            auth_issuer="https://test.example/",
            auth_audience="provia",
            auth_jwks_url="https://test.example/jwks",
        )
    )
    client = jwt.PyJWKClient("https://test.example/jwks")
    jwk = jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key(), as_dict=True)
    jwk.update(kid="integration", alg="RS256", use="sig")
    client.fetch_data = lambda: {"keys": [jwk]}
    verifier._client = client
    db_application.state.token_verifier = verifier

    def headers(subject="user-a"):
        claims = {
            "sub": subject,
            "iss": "https://test.example/",
            "aud": "provia",
            "exp": datetime.now(UTC) + timedelta(minutes=5),
        }
        token = jwt.encode(claims, key, algorithm="RS256", headers={"kid": "integration"})
        return {"Authorization": "Bearer " + token}

    with TestClient(db_application) as api:
        yield api, headers
