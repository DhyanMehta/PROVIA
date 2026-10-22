"""Create a fresh disposable PostgreSQL database for tests, then remove only that DB."""

import os
import subprocess
import sys
from uuid import uuid4

from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool

from app.core.config import Settings
from app.db.session import postgres_url


def main() -> int:
    settings = Settings()
    if settings.app_env not in {"development", "testing"} or not settings.direct_database_url:
        print("BLOCKED: development/testing DIRECT_DATABASE_URL is required")
        return 2
    url = postgres_url(settings.direct_database_url.get_secret_value(), direct=True)
    name = "provia_verify_" + uuid4().hex
    admin = create_engine(
        url,
        isolation_level="AUTOCOMMIT",
        poolclass=NullPool,
        hide_parameters=True,
        connect_args={"connect_timeout": 5},
    )
    created = False
    try:
        with admin.connect() as connection:
            connection.execute(text(f'CREATE DATABASE "{name}"'))
            created = True
        print("Created fresh disposable PostgreSQL test database", flush=True)
        environment = os.environ.copy()
        environment["TEST_DATABASE_URL"] = url.set(database=name).render_as_string(
            hide_password=False
        )
        environment["TEST_DATABASE_DISPOSABLE"] = "true"
        result = subprocess.run(
            [sys.executable, "-m", "pytest", "-v", *sys.argv[1:]],
            env=environment,
            capture_output=True,
            text=True,
        )
        output = result.stdout + result.stderr
        for secret in (
            url.password,
            url.host,
            url.username,
            environment["TEST_DATABASE_URL"],
            settings.direct_database_url.get_secret_value(),
        ):
            if secret:
                output = output.replace(secret, "[redacted]")
        print(output)
        return result.returncode
    except Exception:
        print("BLOCKED: unable to create or use disposable PostgreSQL database; details suppressed")
        return 2
    finally:
        if created:
            assert name.startswith("provia_verify_") and len(name) == 46
            with admin.connect() as connection:
                connection.execute(text(f'DROP DATABASE "{name}" WITH (FORCE)'))
            print("Removed only the generated disposable test database")
        admin.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
