"""Create a fresh disposable PostgreSQL database for tests, then remove only that DB."""

import os
import re
import subprocess
import sys
from pathlib import Path
from uuid import uuid4
from xml.etree import ElementTree

from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool

from app.core.config import Settings
from app.db.session import postgres_url


def redact(value: str, secrets) -> str:
    variants = {variant for secret in secrets if secret for variant in (secret, repr(secret)[1:-1])}
    for value_to_hide in sorted(variants, key=len, reverse=True):
        value = value.replace(value_to_hide, "[redacted]")
    # Pytest assertion introspection can include generated credentials that are
    # not in Settings. Strip compact JWTs and bearer values from diagnostics too.
    value = re.sub(r"(?i)\bBearer\s+[A-Za-z0-9._~+-]+", "Bearer [redacted]", value)
    value = re.sub(
        r"(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+",
        "[redacted-jwt]",
        value,
    )
    return value


def sanitize_junit(arguments, secrets):
    """Pytest writes XML before console redaction; sanitize decoded text/attributes too."""
    for index, argument in enumerate(arguments):
        option, separator, value = argument.partition("=")
        if option not in {"--junitxml", "--junit-xml"}:
            continue
        path = Path(value if separator else arguments[index + 1])
        if not path.exists():
            continue
        tree = ElementTree.parse(path)
        for node in tree.iter():
            if node.text:
                node.text = redact(node.text, secrets)
            if node.tail:
                node.tail = redact(node.tail, secrets)
            for key, item in node.attrib.items():
                node.set(key, redact(item, secrets))
        tree.write(path, encoding="utf-8", xml_declaration=True)


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
            [sys.executable, "-m", "pytest", "-v", "--tb=short", *sys.argv[1:]],
            env=environment,
            capture_output=True,
            text=True,
        )
        secrets = (
            url.password,
            url.host,
            url.username,
            environment["TEST_DATABASE_URL"],
            settings.direct_database_url.get_secret_value(),
            *(
                value.get_secret_value()
                for value in (getattr(settings, name) for name in type(settings).model_fields)
                if hasattr(value, "get_secret_value")
            ),
        )
        sanitize_junit(sys.argv[1:], secrets)
        print(redact(result.stdout + result.stderr, secrets))
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


def run() -> int:
    try:
        return main()
    except Exception:
        # Configuration and finally/cleanup failures must not expose driver data.
        print("BLOCKED: test runner initialization or cleanup failed; details suppressed")
        return 2


if __name__ == "__main__":
    raise SystemExit(run())
