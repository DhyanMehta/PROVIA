"""Read-only cutover preflight. Never migrates, sends mail or prints configuration."""

import json

from sqlalchemy import inspect, text

from app.core.config import Settings
from app.db.session import Database
from app.modules.auth.email import create_delivery
from app.modules.auth.security import AccessTokens

AUTH_TABLES = {
    "auth_accounts",
    "auth_sessions",
    "auth_refresh_tokens",
    "auth_actions",
    "auth_rate_limits",
}


def database_state(connection):
    tables = set(inspect(connection).get_table_names())
    revision = (
        connection.scalar(text("SELECT version_num FROM alembic_version"))
        if "alembic_version" in tables
        else None
    )
    return revision, AUTH_TABLES <= tables


def check(settings, database=None):
    report = {}
    for name, probe in (
        ("signer_configuration", lambda: AccessTokens(settings).secret()),
        ("email_configuration", lambda: create_delivery(settings).available()),
    ):
        try:
            probe()
            report[name] = {"status": "PASS"}
        except Exception:
            report[name] = {"status": "BLOCKED", "reason": "Configuration missing or invalid"}
    db = database if database is not None else Database(settings)
    try:
        with db.engine.connect() as connection:
            revision, present = database_state(connection)
        report["database_schema"] = {
            "status": "PASS" if revision == "0005" and present else "BLOCKED",
            "expected_revision": "0005",
            "revision_matches": revision == "0005",
            "auth_tables_present": present,
        }
    except Exception:
        report["database_schema"] = {"status": "BLOCKED", "reason": "Schema check unavailable"}
    finally:
        if database is None:
            db.dispose()
    report["configuration_and_schema_ready"] = all(
        item["status"] == "PASS" for item in report.values()
    )
    report["real_email_delivery"] = "NOT VERIFIED"
    report["legacy_enrollment"] = "OPERATOR WORKFLOW REQUIRED"
    report["deployed_and_device_acceptance"] = "NOT VERIFIED"
    # A green config/schema check is deliberately not production acceptance.
    return report


def main():
    try:
        report = check(Settings())
    except Exception:
        print(json.dumps({"status": "BLOCKED", "reason": "Invalid application configuration"}))
        return 2
    print(json.dumps(report, indent=2))
    return 0 if report["configuration_and_schema_ready"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
