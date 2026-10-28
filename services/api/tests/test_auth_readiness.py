import base64
import json
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.core.config import Settings
from scripts import verify_auth_readiness as readiness


def database():
    connection = MagicMock()
    engine = MagicMock()
    engine.connect.return_value.__enter__.return_value = connection
    return SimpleNamespace(engine=engine), connection


def configured():
    return Settings(
        _env_file=None,
        auth_jwt_secret="test-only-signing-key-0123456789-abcdefghijklmnopqrstuvwxyz",
        auth_email_provider="resend",
        resend_api_key="test-only-provider-key",
        resend_from="sender@example.com",
        auth_email_encryption_keys=json.dumps(
            [base64.urlsafe_b64encode(bytes(range(32))).decode()]
        ),
        auth_email_worker_enabled=True,
    )


def test_current_schema_does_not_mistake_db_connectivity_for_auth_readiness(monkeypatch):
    db, _ = database()
    monkeypatch.setattr(readiness, "database_state", lambda connection: ("0004", False))
    result = readiness.check(configured(), db)
    assert result["database_schema"]["status"] == "BLOCKED"
    assert result["configuration_and_schema_ready"] is False


def test_configured_schema_still_requires_external_acceptance(monkeypatch):
    db, _ = database()
    monkeypatch.setattr(readiness, "database_state", lambda connection: ("0007", True))
    result = readiness.check(configured(), db)
    assert result["configuration_and_schema_ready"] is True
    assert result["real_email_delivery"] == "NOT VERIFIED"
    assert result["deployed_and_device_acceptance"] == "NOT VERIFIED"
    encoded = json.dumps(result)
    assert "test-only" not in encoded and "sender@example.com" not in encoded


def test_previous_auth_schema_is_not_current_mvp_schema(monkeypatch):
    db, _ = database()
    monkeypatch.setattr(readiness, "database_state", lambda connection: ("0006", True))
    result = readiness.check(configured(), db)
    assert result["database_schema"]["status"] == "BLOCKED"
    assert result["database_schema"]["auth_tables_present"] is True
    assert result["database_schema"]["expected_revision"] == "0007"


def test_connection_failure_and_missing_configuration_are_sanitized(monkeypatch):
    db, _ = database()
    db.engine.connect.side_effect = RuntimeError("private-connection-details")
    result = readiness.check(Settings(_env_file=None), db)
    assert result["configuration_and_schema_ready"] is False
    assert result["signer_configuration"]["status"] == "BLOCKED"
    assert result["email_configuration"]["status"] == "BLOCKED"
    assert "private-connection-details" not in json.dumps(result)


def test_schema_probe_is_read_only_and_checks_all_auth_tables(monkeypatch):
    connection = MagicMock()
    inspector = MagicMock()
    inspector.get_table_names.return_value = ["alembic_version", *readiness.AUTH_TABLES]
    monkeypatch.setattr(readiness, "inspect", lambda _: inspector)
    connection.scalar.return_value = "0006"
    assert readiness.database_state(connection) == ("0006", True)
    assert str(connection.scalar.call_args.args[0]) == "SELECT version_num FROM alembic_version"
    inspector.get_table_names.return_value.remove("auth_actions")
    assert readiness.database_state(connection) == ("0006", False)
