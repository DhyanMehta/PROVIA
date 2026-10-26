"""First-party bearer boundary regressions."""

import pytest

from app.core.config import Settings
from app.core.exceptions import AppError
from app.modules.auth.security import AccessTokens


def test_missing_token(client):
    response = client.get("/api/v1/me")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize("header", ["", "Bearer", "Basic abc", "Bearer a b"])
def test_malformed_headers_before_database(client, header):
    response = client.get("/api/v1/me", headers={"Authorization": header})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "HTTP_401"


def test_unconfigured_signer_fails_closed(client):
    assert client.get("/api/v1/me", headers={"Authorization": "Bearer anything"}).status_code == 503


def test_weak_signing_configuration_rejected():
    with pytest.raises(AppError):
        AccessTokens(Settings(_env_file=None, auth_jwt_secret="a" * 32)).secret()
