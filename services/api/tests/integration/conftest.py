"""Opt-in PostgreSQL tests. Each test owns a fresh, randomly named schema."""

import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.config import Config
from dotenv import dotenv_values
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from alembic import command
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
