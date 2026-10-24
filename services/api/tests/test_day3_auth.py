from datetime import UTC, datetime, timedelta
from unittest.mock import Mock

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException

from app.core.auth import TokenVerifier
from app.core.config import Settings
from app.core.exceptions import AppError


@pytest.fixture
def identity():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    verifier = TokenVerifier(
        Settings(
            _env_file=None,
            auth_issuer="https://test.example",
            auth_audience="provia",
            auth_jwks_url="https://test.example/jwks",
        )
    )
    jwk = jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key(), as_dict=True)
    jwk.update(kid="key", alg="RS256", use="sig")
    verifier._client = Mock()
    verifier._client.get_signing_key.return_value = jwt.PyJWK(jwk)

    def token(changes=None, missing=()):
        claims = {
            "sub": "user-test",
            "iss": "https://test.example",
            "aud": "provia",
            "exp": datetime.now(UTC) + timedelta(minutes=2),
        }
        claims.update(changes or {})
        for name in missing:
            claims.pop(name, None)
        return jwt.encode(claims, key, algorithm="RS256", headers={"kid": "key"})

    return verifier, token


@pytest.mark.parametrize(
    "changes,missing",
    [
        ({"exp": "9999999999"}, ()),
        ({"nbf": False}, ()),
        ({"iat": True}, ()),
        ({"nbf": 9999999999}, ()),
        ({"iat": 9999999999}, ()),
        ({"exp": float("inf")}, ()),
        ({"sub": " "}, ()),
        ({"sub": []}, ()),
        ({"sid": []}, ()),
        ({"sts": []}, ()),
        ({"azp": []}, ()),
        ({}, ("sub",)),
        ({}, ("iss",)),
        ({}, ("aud",)),
    ],
)
def test_invalid_claim_types_and_required_claims(identity, changes, missing):
    verifier, token = identity
    with pytest.raises(HTTPException) as caught:
        verifier.verify(token(changes, missing))
    assert caught.value.status_code == 401


def test_optional_clerk_claims_and_unknown_header_compatibility(identity):
    verifier, token = identity
    verifier.settings.auth_audience = None
    assert verifier.verify(token({"sid": "sess-test", "sts": "active"}, ("aud",)))["sub"]


def test_jwks_outage_has_bounded_retry_and_recovers(identity, monkeypatch):
    verifier, token = identity
    encoded = token()
    client = verifier._client
    original = client.get_signing_key.return_value
    client.get_signing_key.side_effect = jwt.PyJWKClientConnectionError("private-url")
    clock = [100.0]
    monkeypatch.setattr("app.core.auth.monotonic", lambda: clock[0])
    for _ in range(3):
        with pytest.raises(AppError) as caught:
            verifier.verify(encoded)
        assert caught.value.code == "AUTH_UNAVAILABLE"
        assert "private" not in caught.value.message
    assert client.get_signing_key.call_count == 1
    clock[0] += 6
    client.get_signing_key.side_effect = None
    client.get_signing_key.return_value = original
    assert verifier.verify(encoded)["sub"] == "user-test"
    assert client.get_signing_key.call_count == 2


def test_oversized_token_rejected_before_parsing(identity, monkeypatch):
    verifier, _ = identity
    parse = Mock(side_effect=AssertionError("must not parse"))
    monkeypatch.setattr(jwt, "get_unverified_header", parse)
    with pytest.raises(HTTPException):
        verifier.verify("x" * 16385)
    parse.assert_not_called()


def test_duplicate_authorization_and_null_party_are_rejected(application, client, identity):
    verifier, token = identity
    application.state.token_verifier = verifier
    response = client.get(
        "/api/v1/me",
        headers=[
            ("Authorization", "Bearer " + token()),
            ("Authorization", "Bearer " + token()),
        ],
    )
    assert response.status_code == 401
    with pytest.raises(HTTPException):
        verifier.verify(token({"azp": None}))


@pytest.mark.parametrize("header", ["", "Bearer", "Basic abc", "Bearer a b", "Bearer malformed"])
def test_malformed_headers_are_safe(application, client, identity, header):
    application.state.token_verifier = identity[0]
    response = client.get("/api/v1/me", headers={"Authorization": header})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "HTTP_401"
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.headers["x-request-id"]
