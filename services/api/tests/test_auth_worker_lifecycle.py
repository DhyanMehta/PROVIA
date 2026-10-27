from threading import Event
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from app.application import create_app
from app.core.config import Settings
from app.modules.auth.runner import ManagedEmailWorker


def test_managed_worker_finishes_current_attempt_before_stop_returns():
    entered, release = Event(), Event()
    worker = MagicMock()

    def attempt():
        entered.set()
        assert release.wait(2)

    worker.run_once.side_effect = attempt
    runner = ManagedEmailWorker(worker, 60)
    runner.start()
    assert entered.wait(2)
    release.set()
    runner.stop()
    assert not runner.thread.is_alive()
    assert worker.run_once.call_count == 1


def test_poll_failure_is_sanitized_and_worker_can_stop(caplog):
    attempted = Event()
    worker = MagicMock()

    def attempt():
        attempted.set()
        raise RuntimeError("private-token-and-provider-body")

    worker.run_once.side_effect = attempt
    runner = ManagedEmailWorker(worker, 60)
    runner.start()
    assert attempted.wait(2)
    runner.stop()
    assert "private-token-and-provider-body" not in caplog.text
    assert not runner.thread.is_alive()


def test_worker_disabled_default_never_opens_database_or_starts_thread(monkeypatch):
    application = create_app(Settings(_env_file=None))
    factory = MagicMock()
    monkeypatch.setattr("app.application.ManagedEmailWorker", factory)
    with TestClient(application) as client:
        assert client.get("/api/v1/health").status_code == 200
    factory.assert_not_called()


def test_lifespan_joins_supervisor_before_disposing_database(monkeypatch):
    events = []

    class Supervisor:
        def __init__(self, worker, poll_seconds):
            pass

        def start(self):
            events.append("started")

        def stop(self):
            events.append("stopped")

    application = create_app(Settings(_env_file=None, auth_email_worker_enabled=True))
    monkeypatch.setattr("app.application.ManagedEmailWorker", Supervisor)
    monkeypatch.setattr("app.modules.auth.outbox.EmailWorker", MagicMock())
    monkeypatch.setattr(application.state.database, "dispose", lambda: events.append("disposed"))
    with TestClient(application) as client:
        assert events == ["started"]
        assert client.get("/api/v1/health").status_code == 200
    assert events == ["started", "stopped", "disposed"]


def test_worker_recovers_after_poll_error_instead_of_losing_supervision(caplog):
    recovered = Event()
    worker = MagicMock()
    attempts = 0

    def attempt():
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise RuntimeError("private-provider-detail")
        recovered.set()

    worker.run_once.side_effect = attempt
    runner = ManagedEmailWorker(worker, 0.01)
    runner.start()
    try:
        assert recovered.wait(2)
    finally:
        runner.stop()
    assert worker.run_once.call_count >= 2
    assert "private-provider-detail" not in caplog.text
