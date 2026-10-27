"""Read-only, private operator view; never includes recipients or action payloads."""

import json

from sqlalchemy import func, inspect, select

from app.core.config import Settings
from app.db.auth_models import AuthEmailJob
from app.db.session import Database

STATES = {"queued", "processing", "retry", "sent", "cancelled", "expired", "failed"}


def status(settings, database=None):
    db = database if database is not None else Database(settings)
    try:
        with db.engine.connect() as connection:
            if "auth_email_jobs" not in inspect(connection).get_table_names():
                return {"status": "BLOCKED", "reason": "Outbox schema unavailable"}
            rows = connection.execute(
                select(AuthEmailJob.state, func.count()).group_by(AuthEmailJob.state)
            ).all()
            if any(
                state not in STATES or type(count) is not int or count < 0 for state, count in rows
            ):
                raise ValueError
        return {
            "status": "PASS",
            "counts": {state: dict(rows).get(state, 0) for state in sorted(STATES)},
            "local_worker_enabled": settings.auth_email_worker_enabled,
            "local_requests_enabled": settings.auth_email_requests_enabled,
            "scope": "Configured database counts; not a remote worker heartbeat or inbox receipt",
        }
    except Exception:
        return {"status": "BLOCKED", "reason": "Outbox status unavailable"}
    finally:
        if database is None:
            db.dispose()


def main():
    try:
        report = status(Settings())
    except Exception:
        report = {"status": "BLOCKED", "reason": "Invalid operator configuration"}
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
