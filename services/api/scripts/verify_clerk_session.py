"""Interactive development-only real-session probe; never persists or prints tokens."""

import argparse
import getpass
import sys
import warnings
from urllib.parse import urlsplit

import httpx
from sqlalchemy import select

from app.core.auth import TokenVerifier
from app.core.config import Settings
from app.db.models import User
from app.db.session import Database


def probe(settings, base_url, token, phase):
    parsed = urlsplit(base_url)
    if (
        settings.app_env != "development"
        or not (urlsplit(settings.auth_issuer or "").hostname or "").endswith(".clerk.accounts.dev")
        or parsed.scheme != "http"
        or parsed.hostname not in {"localhost", "127.0.0.1", "::1"}
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.path.rstrip("/") != settings.api_v1_prefix
    ):
        raise ValueError("Development Clerk and loopback API required")
    with httpx.Client(
        base_url=base_url.rstrip("/") + "/", timeout=10, follow_redirects=False, trust_env=False
    ) as client:
        assert client.get("me").status_code == 401
        assert client.get("me", headers={"Authorization": "Bearer invalid"}).status_code == 401
        response = client.get("me", headers={"Authorization": "Bearer " + token})
        if phase == "expired":
            assert response.status_code == 401
            return "PASS: supplied expired token rejected (operator must confirm token provenance)"
        if phase == "signed-out":
            assert response.status_code in {200, 401}
            return (
                "OBSERVED: JWT still accepted; stateless verification does not check sign-out"
                if response.status_code == 200
                else "OBSERVED: supplied signed-out token rejected"
            )
        assert response.status_code == 200
        claims = TokenVerifier(settings).verify(token)
        database = Database(settings)
        try:
            with database.session() as session:
                expected = session.scalar(
                    select(User.id).where(User.auth_provider_subject == claims["sub"])
                )
                assert expected is not None and response.json()["id"] == str(expected)
        finally:
            database.dispose()
        owned = client.get("water-logs", headers={"Authorization": "Bearer " + token})
        assert owned.status_code == 200 and isinstance(owned.json()["items"], list)
        return "PASS: real token, matching local user, owned collection and negative controls"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000/api/v1")
    parser.add_argument("--phase", choices=("active", "expired", "signed-out"), default="active")
    args = parser.parse_args()
    if not sys.stdin.isatty():
        print("BLOCKED: interactive terminal and authorized development client session required")
        return 2
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", getpass.GetPassWarning)
            token = getpass.getpass("Development session token (hidden; never saved): ")
        print(probe(Settings(), args.base_url, token, args.phase))
        return 0
    except Exception:
        print("FAIL/BLOCKED: verification failed; details suppressed to protect session data")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
