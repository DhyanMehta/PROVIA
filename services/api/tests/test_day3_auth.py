"""First-party strict claim and duplicate-header regressions."""

from uuid import uuid4

import jwt
import pytest
from fastapi import HTTPException
from pydantic import SecretStr

from app.core.config import Settings
from app.modules.auth.security import AccessTokens
from tests.test_first_party_security import TEST_SECRET


@pytest.mark.parametrize("field", ["sub", "sid", "jti", "iss", "aud", "iat", "nbf", "exp", "type"])
def test_every_access_claim_is_required(field):
    verifier = AccessTokens(Settings(_env_file=None, auth_jwt_secret=TEST_SECRET))
    claims = verifier.verify(verifier.issue(uuid4(), uuid4()))
    del claims[field]
    with pytest.raises(HTTPException):
        verifier.verify(jwt.encode(claims, TEST_SECRET, algorithm="HS256"))


def test_duplicate_authorization_is_rejected_before_database(application, client):
    application.state.settings.auth_jwt_secret = SecretStr(TEST_SECRET)
    verifier = AccessTokens(application.state.settings)
    token = verifier.issue(uuid4(), uuid4())
    response = client.get(
        "/api/v1/me",
        headers=[("Authorization", "Bearer " + token), ("Authorization", "Bearer " + token)],
    )
    assert response.status_code == 401


def test_oversized_token_is_rejected_before_decode():
    verifier = AccessTokens(Settings(_env_file=None, auth_jwt_secret=TEST_SECRET))
    with pytest.raises(HTTPException):
        verifier.verify("x" * 4097)
