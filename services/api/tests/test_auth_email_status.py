import json
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.core.config import Settings
from scripts import auth_email_status


def test_status_aggregates_without_exposing_payloads_or_settings(monkeypatch):
    inspector = MagicMock()
    inspector.get_table_names.return_value = ["auth_email_jobs"]
    monkeypatch.setattr(auth_email_status, "inspect", lambda connection: inspector)
    connection = MagicMock()
    connection.execute.return_value.all.return_value = [("queued", 2), ("failed", 1)]
    db = SimpleNamespace(engine=MagicMock())
    db.engine.connect.return_value.__enter__.return_value = connection
    settings = Settings(_env_file=None, auth_jwt_secret="test-only-private-key")
    report = auth_email_status.status(settings, db)
    assert report["counts"]["queued"] == 2 and report["counts"]["sent"] == 0
    query = str(connection.execute.call_args.args[0])
    assert "payload_ciphertext" not in query and "action_id" not in query
    assert "test-only-private-key" not in json.dumps(report)


def test_status_failure_never_reflects_database_error_details():
    db = SimpleNamespace(engine=MagicMock())
    db.engine.connect.side_effect = RuntimeError("private-connection-details")
    report = auth_email_status.status(Settings(_env_file=None), db)
    assert report["status"] == "BLOCKED"
    assert "private-connection-details" not in json.dumps(report)
