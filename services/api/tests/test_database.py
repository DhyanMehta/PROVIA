from unittest.mock import MagicMock

import pytest
from sqlalchemy.exc import OperationalError

from app.core.config import Settings
from app.core.exceptions import AppError
from app.db.dependencies import get_db
from app.db.session import Database, postgres_url


def test_database_unconfigured(client):
    response = client.get("/api/v1/health/db")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "DATABASE_UNAVAILABLE"


def test_engine_created_without_connection():
    database = Database(Settings(_env_file=None, database_url="postgresql://localhost/provia_test"))
    assert database._engine is None
    assert database.engine.dialect.driver == "psycopg"
    database.dispose()


def test_neon_ssl_and_direct_url():
    assert postgres_url("postgresql://example.neon.tech/db").query["sslmode"] == "require"
    with pytest.raises(AppError):
        postgres_url("postgresql://example-pooler.neon.tech/db", direct=True)


def test_health_select_success_and_failure(application, client):
    database = MagicMock()
    application.state.database = database
    connection = database.engine.connect.return_value.__enter__.return_value
    connection.scalar.return_value = 1
    assert client.get("/api/v1/health/db").status_code == 200
    database.engine.connect.side_effect = OperationalError("secret-url", {}, Exception("secret"))
    response = client.get("/api/v1/health/db")
    assert response.status_code == 503
    assert "secret" not in response.text


def test_session_rollback_and_cleanup():
    request = MagicMock()
    session = request.app.state.database.session.return_value
    dependency = get_db(request)
    assert next(dependency) is session
    with pytest.raises(ValueError):
        dependency.throw(ValueError())
    session.rollback.assert_called_once()
    session.close.assert_called_once()
