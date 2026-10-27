from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.core.config import Settings
from app.core.exceptions import AppError
from app.modules.auth.schemas import RegisterIn
from app.modules.auth.security import (
    AccessTokens,
    check_password,
    digest,
    hash_password,
    opaque_token,
)

TEST_SECRET = "test-only-signing-key-0123456789-abcdefghijklmnopqrstuvwxyz"


def tokens():
    return AccessTokens(Settings(_env_file=None, auth_jwt_secret=TEST_SECRET))


def test_argon2_salts_and_exact_unicode_passwords():
    password = "  längėr password 🥑  "
    a, b = hash_password(password), hash_password(password)
    assert a.startswith("$argon2id$") and a != b
    assert check_password(a, password)
    assert not check_password(a, password.strip())


def test_auth_input_does_not_trim_passwords():
    value = RegisterIn(name=" Test ", email="Test@EXAMPLE.COM", password="  a long password  ")
    assert value.password == "  a long password  " and value.email == "test@example.com"
    with pytest.raises(ValidationError):
        RegisterIn(name="Test", email="bad", password="weak")


def test_access_round_trip_and_no_secret_configuration():
    issuer = tokens()
    user, session = uuid4(), uuid4()
    claims = issuer.verify(issuer.issue(user, session))
    assert claims["sub"] == str(user) and claims["sid"] == str(session)
    with pytest.raises(AppError):
        AccessTokens(Settings(_env_file=None)).issue(user, session)


@pytest.mark.parametrize(
    "change",
    [
        "expired",
        "issuer",
        "audience",
        "signature",
        "algorithm",
        "missing",
        "type",
        "numeric",
        "subject",
    ],
)
def test_access_rejects_invalid_claims(change):
    verifier = tokens()
    claims = verifier.verify(verifier.issue(uuid4(), uuid4()))
    key, algorithm = TEST_SECRET, "HS256"
    if change == "expired":
        claims["exp"] = datetime.now(UTC) - timedelta(seconds=1)
    elif change == "issuer":
        claims["iss"] = "other"
    elif change == "audience":
        claims["aud"] = "other"
    elif change == "signature":
        key = TEST_SECRET + "wrong"
    elif change == "algorithm":
        algorithm = "HS384"
    elif change == "missing":
        del claims["sid"]
    elif change == "type":
        claims["type"] = "refresh"
    elif change == "numeric":
        claims["iat"] = True
    else:
        claims["sub"] = "not-a-uuid"
    with pytest.raises(HTTPException):
        verifier.verify(jwt.encode(claims, key, algorithm=algorithm))


def test_random_opaque_tokens_and_purpose_keyed_buckets():
    a, b = opaque_token(), opaque_token()
    assert len(a) >= 43 and a != b and digest(a) != a
    verifier = tokens()
    assert verifier.bucket("login", "identity") != verifier.bucket("reset", "identity")


@pytest.mark.parametrize(
    ("peer", "forwarded", "expected"),
    [
        ("198.51.100.9", ["203.0.113.1"], "198.51.100.9"),
        ("10.0.0.2", ["203.0.113.1, 198.51.100.9, 10.0.0.3"], "198.51.100.9"),
        ("10.0.0.2", ["203.0.113.1", "198.51.100.9"], "10.0.0.2"),
        ("10.0.0.2", ["203.0.113.2", "198.51.100.9"], "10.0.0.2"),
        ("10.0.0.2", ["invalid"], "10.0.0.2"),
        ("10.0.0.2", ["203.0.113.1, invalid"], "10.0.0.2"),
        ("10.0.0.2", [", ".join(["198.51.100.9"] * 6)], "10.0.0.2"),
    ],
)
def test_proxy_identity_uses_only_unambiguous_trusted_forwarding(peer, forwarded, expected):
    from types import SimpleNamespace

    from starlette.requests import Request

    from app.modules.auth.dependencies import client_identity

    request = Request(
        {
            "type": "http",
            "client": (peer, 443),
            "headers": [(b"x-forwarded-for", value.encode("ascii")) for value in forwarded],
            "app": SimpleNamespace(
                state=SimpleNamespace(
                    settings=Settings(_env_file=None, auth_trusted_proxy_cidrs=["10.0.0.0/8"])
                )
            ),
        }
    )
    assert client_identity(request) == expected
