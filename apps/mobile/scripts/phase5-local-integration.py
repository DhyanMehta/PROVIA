"""Run real mobile JS clients over loopback HTTP against a fresh disposable DB.

Run from services/api with the no-sync Python environment and this script's path.
The only substituted boundaries are external email delivery and native token storage.
"""

import json
import logging
import os
import secrets
import shutil
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path
from uuid import uuid4

API_ROOT = Path(__file__).resolve().parents[3] / "services" / "api"
sys.path.insert(0, str(API_ROOT))


def failure_category(error):
    """Return an allowlisted category, never exception text, SQL or connection data."""
    seen = set()
    current = error
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if isinstance(current, socket.gaierror) or getattr(current, "errno", None) == 11001:
            return "DNS_RESOLUTION"
        if isinstance(current, (TimeoutError, subprocess.TimeoutExpired)):
            return "TIMEOUT"
        if isinstance(current, PermissionError):
            return "PERMISSION"
        if isinstance(current, ConnectionError):
            return "CONNECTION"
        current = getattr(current, "orig", None) or current.__cause__ or current.__context__
    # Driver exceptions need not preserve the socket error as a cause. Classify
    # their known types without exposing the message, which can contain a DSN.
    from sqlalchemy.exc import DBAPIError

    if isinstance(error, DBAPIError):
        return "DATABASE"
    if isinstance(error, OSError):
        return "OPERATING_SYSTEM"
    return "SETUP_OR_ASSERTION"


class ControlledDelivery:
    """An explicit test sink; never sends real mail or exposes tokens via HTTP."""

    def __init__(self):
        self.messages = []

    def available(self):
        pass

    def send(self, email, purpose, token, *, idempotency_key=None):
        self.messages.append((email, purpose, token))


def main():
    # Resolve the frozen backend only after adding its explicit workspace root.
    import uvicorn
    from alembic.config import Config
    from cryptography.fernet import Fernet
    from pydantic import SecretStr
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import NullPool

    from alembic import command
    from app.application import create_app
    from app.core.config import Settings
    from app.db.session import postgres_url
    from app.modules.auth.outbox import EmailWorker

    os.chdir(API_ROOT)
    configured = Settings()
    if configured.app_env not in {"development", "testing"} or not configured.direct_database_url:
        print("BLOCKED: development/testing direct database configuration is required")
        return 2
    node = shutil.which("node")
    if not node:
        print("BLOCKED: existing Node.js runtime is required")
        return 2
    admin_url = postgres_url(configured.direct_database_url.get_secret_value(), direct=True)
    name = "provia_mobile_" + uuid4().hex
    admin = create_engine(
        admin_url,
        isolation_level="AUTOCOMMIT",
        poolclass=NullPool,
        hide_parameters=True,
        connect_args={"connect_timeout": 5},
    )
    created = False
    engine = server = thread = child = bound = None
    stage = "CREATE_DISPOSABLE_DATABASE"
    try:
        with admin.connect() as connection:
            connection.execute(text(f'CREATE DATABASE "{name}"'))
        created = True
        print("Created a new disposable mobile integration database", flush=True)
        engine = create_engine(
            admin_url.set(database=name),
            hide_parameters=True,
            connect_args={"connect_timeout": 5, "options": "-c timezone=UTC"},
        )
        logging.disable(logging.CRITICAL)
        stage = "CONNECT_DISPOSABLE_DATABASE"
        with engine.begin() as connection:
            stage = "APPLY_INCREMENTAL_MIGRATIONS"
            migration = Config(str(API_ROOT / "alembic.ini"))
            migration.attributes["connection"] = connection
            command.upgrade(migration, "head")
            if connection.scalar(text("SELECT version_num FROM alembic_version")) != "0007":
                raise RuntimeError("Migration revision mismatch")
        print("Incremental migrations applied to disposable database: 0007", flush=True)
        stage = "INITIALIZE_TEST_APPLICATION"
        settings = Settings(
            _env_file=None,
            app_env="testing",
            debug=False,
            log_level="CRITICAL",
            database_url=None,
            direct_database_url=None,
            auth_jwt_secret=SecretStr(secrets.token_urlsafe(64)),
            auth_email_encryption_keys=SecretStr(json.dumps([Fernet.generate_key().decode()])),
            auth_email_worker_enabled=False,
            resend_api_key=None,
            smtp_password=None,
            usda_api_key=None,
        )
        app = create_app(settings)
        app.state.database._engine = engine
        app.state.database._sessions = sessionmaker(engine, expire_on_commit=False)
        delivery = ControlledDelivery()
        app.state.auth_delivery = delivery
        # Test searches select source=local; provider HTTP is additionally unavailable.
        app.state.food_providers = {}
        worker = EmailWorker(app.state.database, settings, delivery)
        stage = "START_LOOPBACK_HTTP_SERVER"
        bound = socket.socket()
        bound.bind(("127.0.0.1", 0))
        bound.listen(128)
        port = bound.getsockname()[1]
        server = uvicorn.Server(
            uvicorn.Config(app, host="127.0.0.1", port=port, log_level="critical", access_log=False)
        )
        thread = threading.Thread(target=server.run, kwargs={"sockets": [bound]}, daemon=True)
        thread.start()
        for _ in range(100):
            if server.started:
                break
            if not thread.is_alive():
                raise RuntimeError("Local HTTP server failed")
            time.sleep(0.05)
        if not server.started:
            raise RuntimeError("Local HTTP server did not become ready")
        environment = {
            key: value
            for key, value in os.environ.items()
            if not any(
                word in key.upper()
                for word in ("TOKEN", "SECRET", "PASSWORD", "DATABASE", "API_KEY")
            )
        }
        stage = "START_REAL_MOBILE_CLIENT"
        child = subprocess.Popen(
            [
                node,
                str(Path(__file__).with_name("phase5-local-integration.cjs")),
                f"http://127.0.0.1:{port}/api/v1",
            ],
            cwd=Path(__file__).resolve().parents[1],
            env=environment,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
        )
        timeout = threading.Timer(600, child.kill)
        timeout.start()
        passed = 0
        completed = False
        stage = "EXECUTE_REAL_HTTP_CHECKPOINTS"
        try:
            for line in child.stdout:
                event = json.loads(line)
                if event.get("event") == "drain":
                    for _ in range(30):
                        if not worker.run_once():
                            break
                    else:
                        raise RuntimeError("Controlled test-email queue did not settle")
                    matching = [row for row in delivery.messages if row[1] == "verify_email"]
                    if not matching:
                        raise RuntimeError("Controlled delivery has no verification action")
                    child.stdin.write(json.dumps({"token": matching[-1][2]}) + "\n")
                    child.stdin.flush()
                elif event.get("event") == "pass":
                    passed += 1
                    # Labels are constant program strings, never server data or identifiers.
                    label = str(event.get("label", ""))
                    if (
                        not label
                        or len(label) > 100
                        or not all(c.isalnum() or c in " -/:()" for c in label)
                    ):
                        raise RuntimeError("Unsafe test label")
                    print(f"PASS {passed:02d}: {label}", flush=True)
                elif event.get("event") == "failure":
                    # Only bounded numeric HTTP status and static client code are surfaced.
                    status = event.get("status")
                    code = str(event.get("code", "ASSERTION"))
                    safe = (
                        code if code.replace("_", "").isalnum() and len(code) <= 64 else "ASSERTION"
                    )
                    print(
                        f"FAIL after {passed} checkpoints: "
                        f"HTTP {status if isinstance(status, int) else 0}; {safe}",
                        flush=True,
                    )
                elif event.get("event") == "complete":
                    requests = event.get("requests")
                    statuses = event.get("statuses")
                    if (
                        not isinstance(requests, int)
                        or requests < 27
                        or not isinstance(statuses, dict)
                    ):
                        raise RuntimeError("Incomplete HTTP evidence")
                    if any(
                        not str(key).isdigit() or not isinstance(value, int)
                        for key, value in statuses.items()
                    ):
                        raise RuntimeError("Unsafe HTTP evidence")
                    completed = True
                    print(
                        f"Actual HTTP requests: {requests}; "
                        f"statuses: {json.dumps(statuses, sort_keys=True)}",
                        flush=True,
                    )
                else:
                    raise RuntimeError("Unknown test protocol event")
            result = child.wait(timeout=10)
            if result or passed < 27 or not completed:
                print(f"FAILED: {passed} real HTTP checkpoints completed", flush=True)
                return 1
            print(
                f"PASS: {passed} real HTTP checkpoints; "
                "controlled email sink and in-memory native storage substitute",
                flush=True,
            )
            return 0
        finally:
            timeout.cancel()
    except Exception as error:
        print(
            f"BLOCKED/FAILED: stage={stage}; category={failure_category(error)}; "
            "sensitive details suppressed",
            flush=True,
        )
        return 2
    finally:
        if child and child.poll() is None:
            child.kill()
            child.wait(timeout=10)
        if server:
            server.should_exit = True
        if thread:
            thread.join(timeout=10)
        if bound:
            bound.close()
        if engine:
            engine.dispose()
        if created:
            assert name.startswith("provia_mobile_") and len(name) == 46
            with admin.connect() as connection:
                connection.execute(text(f'DROP DATABASE "{name}" WITH (FORCE)'))
            print("Removed only this run newly generated disposable database", flush=True)
        admin.dispose()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        print("BLOCKED: runner initialization or owned-resource cleanup failed; details suppressed")
        raise SystemExit(2) from None
