from datetime import UTC, datetime, timedelta

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException

from app.core.auth import TokenVerifier
from app.core.config import Settings


@pytest.fixture
def signing_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture
def token_setup(signing_key):
    settings = Settings(
        _env_file=None,
        auth_issuer="https://identity.example/",
        auth_audience="provia",
        auth_jwks_url="https://identity.example/jwks",
    )
    verifier = TokenVerifier(settings)
    client = jwt.PyJWKClient(settings.auth_jwks_url)
    jwk = jwt.algorithms.RSAAlgorithm.to_jwk(signing_key.public_key(), as_dict=True)
    jwk.update(kid="test-key", alg="RS256", use="sig")
    client.fetch_data = lambda: {"keys": [jwk]}
    verifier._client = client
    claims = {
        "sub": "test-user",
        "iss": settings.auth_issuer,
        "aud": settings.auth_audience,
        "exp": datetime.now(UTC) + timedelta(minutes=5),
    }
    return verifier, claims


def test_valid_signed_jwt(signing_key, token_setup):
    verifier, claims = token_setup
    token = jwt.encode(claims, signing_key, algorithm="RS256", headers={"kid": "test-key"})
    assert verifier.verify(token)["sub"] == "test-user"


def test_clerk_optional_audience_and_azp(signing_key, token_setup):
    verifier, claims = token_setup
    verifier.settings.auth_audience = None
    del claims["aud"]
    claims["azp"] = "http://localhost:5173"
    token = jwt.encode(claims, signing_key, algorithm="RS256", headers={"kid": "test-key"})
    assert verifier.verify(token)["sub"] == "test-user"
    claims["azp"] = "https://untrusted.example"
    token = jwt.encode(claims, signing_key, algorithm="RS256", headers={"kid": "test-key"})
    with pytest.raises(HTTPException):
        verifier.verify(token)


def test_clerk_pending_session(signing_key, token_setup):
    verifier, claims = token_setup
    claims["sts"] = "pending"
    token = jwt.encode(claims, signing_key, algorithm="RS256", headers={"kid": "test-key"})
    with pytest.raises(HTTPException) as error:
        verifier.verify(token)
    assert error.value.status_code == 403


@pytest.mark.parametrize(
    "change",
    ["expired", "issuer", "audience", "signature", "kid", "algorithm", "unsigned", "missing_exp"],
)
def test_invalid_jwt(signing_key, token_setup, change):
    verifier, claims = token_setup
    key, alg, kid = signing_key, "RS256", "test-key"
    if change == "expired":
        claims["exp"] = datetime.now(UTC) - timedelta(seconds=1)
    elif change == "issuer":
        claims["iss"] = "https://wrong.example/"
    elif change == "audience":
        claims["aud"] = "wrong"
    elif change == "signature":
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    elif change == "kid":
        kid = "unknown"
    elif change == "algorithm":
        key, alg = "x" * 32, "HS256"
    elif change == "unsigned":
        key, alg = None, "none"
    else:
        del claims["exp"]
    token = jwt.encode(claims, key, algorithm=alg, headers={"kid": kid})
    with pytest.raises(HTTPException) as error:
        verifier.verify(token)
    assert error.value.status_code == 401


def test_missing_token(client):
    response = client.get("/api/v1/me")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_provider_unconfigured(client):
    assert client.get("/api/v1/me", headers={"Authorization": "Bearer anything"}).status_code == 503


def test_authenticated_me_with_local_key(application, signing_key, token_setup, monkeypatch):
    from unittest.mock import MagicMock
    from uuid import uuid4

    from fastapi.testclient import TestClient

    from app.db.models import User
    from app.modules.users.repository import UserRepository

    verifier, claims = token_setup
    application.state.token_verifier = verifier
    application.state.database = MagicMock()
    now = datetime.now(UTC)
    user = User(
        id=uuid4(), auth_provider_subject=claims["sub"], email=None, created_at=now, updated_at=now
    )
    resolved = []

    def resolve(repository, subject, email):
        resolved.append(subject)
        return user

    monkeypatch.setattr(UserRepository, "resolve", resolve)
    token = jwt.encode(claims, signing_key, algorithm="RS256", headers={"kid": "test-key"})
    with TestClient(application) as client:
        response = client.get("/api/v1/me", headers={"Authorization": "Bearer " + token})
        assert response.status_code == 200
        assert response.json()["id"] == str(user.id)
        assert resolved == [claims["sub"]]
        invalid = client.get("/api/v1/me", headers={"Authorization": "Bearer invalid"})
        assert invalid.status_code == 401
        assert resolved == [claims["sub"]]
