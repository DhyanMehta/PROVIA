from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.auth_models import AuthAccount, AuthAction, AuthRefreshToken, AuthSession
from app.db.models import User
from app.modules.auth.security import digest
from tests.test_first_party_security import TEST_SECRET

pytestmark = pytest.mark.integration
PASSWORD = "A sufficiently long password 🥑"


class TestDelivery:
    __test__ = False

    def __init__(self):
        self.messages = []

    def available(self):
        pass

    def send(self, email, purpose, token):
        self.messages.append((email, purpose, token))


@pytest.fixture
def native(db_application):
    db_application.state.settings.auth_jwt_secret = SecretStr(TEST_SECRET)
    delivery = TestDelivery()
    db_application.state.auth_delivery = delivery
    with TestClient(db_application) as api:
        yield api, delivery


def register(api, email="first@example.com"):
    return api.post(
        "/api/v1/auth/register", json={"name": "First", "email": email, "password": PASSWORD}
    )


def login(api, email="first@example.com", password=PASSWORD):
    return api.post("/api/v1/auth/login", json={"email": email, "password": password})


def verified(native, email="first@example.com"):
    api, delivery = native
    assert register(api, email).status_code == 202
    assert (
        api.post("/api/v1/auth/verify-email", json={"token": delivery.messages[-1][2]}).status_code
        == 200
    )
    result = login(api, email)
    assert result.status_code == 200
    return result.json()


def headers(result):
    return {"Authorization": "Bearer " + result["access_token"]}


def test_registration_verification_login_and_secret_storage(native, pg_engine):
    api, delivery = native
    first = register(api)
    assert first.status_code == 202 and first.headers["cache-control"] == "no-store"
    assert "token" not in first.json() and "password" not in first.json()
    assert register(api, "FIRST@EXAMPLE.COM").json() == first.json()
    pending = login(api)
    assert pending.status_code == 200 and pending.json()["user"]["email_verified"] is False
    assert login(api, password="wrong").status_code == 401
    assert login(api, "missing@example.com", "wrong").json() == login(api, password="wrong").json()
    raw = delivery.messages[0][2]
    with Session(pg_engine) as db:
        account = db.scalar(select(AuthAccount))
        assert (
            account.password_hash.startswith("$argon2id$") and PASSWORD not in account.password_hash
        )
        assert db.scalar(select(func.count()).select_from(User)) == 1
        assert db.scalar(select(AuthAction)).token_hash == digest(raw)
    assert api.post("/api/v1/auth/verify-email", json={"token": raw}).status_code == 200
    assert api.post("/api/v1/auth/verify-email", json={"token": raw}).status_code == 400
    result = login(api).json()
    assert result["user"]["email_verified"] is True
    assert api.get("/api/v1/auth/me", headers=headers(result)).json()["id"] == result["user"]["id"]


def test_refresh_rotation_replay_commits_family_revocation(native, pg_engine):
    api, _ = native
    first = verified(native)
    second = api.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert second.status_code == 200
    assert second.json()["refresh_token"] != first["refresh_token"]
    assert (
        api.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]}).status_code
        == 401
    )
    assert (
        api.post(
            "/api/v1/auth/refresh", json={"refresh_token": second.json()["refresh_token"]}
        ).status_code
        == 401
    )
    assert api.get("/api/v1/auth/me", headers=headers(second.json())).status_code == 401
    with Session(pg_engine) as db:
        assert db.scalar(select(AuthSession)).revoked_at is not None
        assert db.scalar(select(func.count()).select_from(AuthRefreshToken)) == 2


def test_concurrent_rotation_has_one_success_and_fails_closed_on_reuse(native, pg_engine):
    api, _ = native
    result = verified(native)
    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(
            executor.map(
                lambda _: api.post(
                    "/api/v1/auth/refresh", json={"refresh_token": result["refresh_token"]}
                ),
                range(2),
            )
        )
    assert sorted(row.status_code for row in responses) == [200, 401]
    winner = next(row.json() for row in responses if row.status_code == 200)
    assert api.get("/api/v1/auth/me", headers=headers(winner)).status_code == 401
    with Session(pg_engine) as db:
        assert db.scalar(select(func.count()).select_from(AuthRefreshToken)) == 2


def test_reset_and_change_password_revoke_sessions_and_actions(native):
    api, delivery = native
    first = verified(native)
    response = api.post("/api/v1/auth/forgot-password", json={"email": "first@example.com"})
    assert response.status_code == 202
    assert (
        api.post("/api/v1/auth/forgot-password", json={"email": "unknown@example.com"}).json()
        == response.json()
    )
    reset = delivery.messages[-1][2]
    new_password = "A completely different secure password"
    assert (
        api.post(
            "/api/v1/auth/reset-password", json={"token": reset, "new_password": new_password}
        ).status_code
        == 200
    )
    assert (
        api.post(
            "/api/v1/auth/reset-password", json={"token": reset, "new_password": PASSWORD}
        ).status_code
        == 400
    )
    assert api.get("/api/v1/auth/me", headers=headers(first)).status_code == 401
    assert login(api).status_code == 401
    second = login(api, password=new_password).json()
    assert (
        api.post("/api/v1/auth/forgot-password", json={"email": "first@example.com"}).status_code
        == 202
    )
    old_reset = delivery.messages[-1][2]
    assert (
        api.post(
            "/api/v1/auth/change-password",
            headers=headers(second),
            json={"password": new_password, "new_password": PASSWORD},
        ).status_code
        == 200
    )
    assert api.get("/api/v1/auth/me", headers=headers(second)).status_code == 401
    assert (
        api.post(
            "/api/v1/auth/reset-password", json={"token": old_reset, "new_password": new_password}
        ).status_code
        == 400
    )


def test_configured_but_failed_delivery_has_generic_outcomes_and_rolls_back(
    native, pg_engine, db_application
):
    from app.core.exceptions import AppError

    api, delivery = native
    verified(native)
    with Session(pg_engine) as db:
        account = db.scalar(select(AuthAccount))
        account.email_verified_at, account.status = None, "pending_verification"
        db.commit()

    class FailingDelivery:
        def available(self):
            pass

        def send(self, *args):
            raise AppError("EMAIL_UNAVAILABLE", "Email delivery is unavailable", 503)

    db_application.state.auth_delivery = FailingDelivery()
    for path in ["/forgot-password", "/resend-verification"]:
        known = api.post("/api/v1/auth" + path, json={"email": "first@example.com"})
        unknown = api.post("/api/v1/auth" + path, json={"email": "unknown@example.com"})
        assert known.status_code == unknown.status_code == 202 and known.json() == unknown.json()
    existing = register(api)
    unknown = register(api, "unknown@example.com")
    assert existing.status_code == unknown.status_code == 202 and existing.json() == unknown.json()
    with Session(pg_engine) as db:
        assert db.scalar(select(func.count()).select_from(AuthAccount)) == 1
        assert db.scalar(select(func.count()).select_from(User)) == 1
        assert (
            db.scalar(
                select(func.count())
                .select_from(AuthAction)
                .where(AuthAction.purpose == "reset_password")
            )
            == 0
        )


def test_pending_and_expired_sessions_cannot_read_fitness_data(native, pg_engine):
    api, delivery = native
    assert register(api).status_code == 202
    pending = login(api).json()
    assert api.get("/api/v1/auth/me", headers=headers(pending)).status_code == 200
    assert api.get("/api/v1/me", headers=headers(pending)).status_code == 403
    assert api.get("/api/v1/dashboard/today", headers=headers(pending)).status_code == 403
    assert (
        api.post("/api/v1/auth/verify-email", json={"token": delivery.messages[-1][2]}).status_code
        == 200
    )
    assert api.get("/api/v1/me", headers=headers(pending)).status_code == 200
    with Session(pg_engine) as db:
        family = db.scalar(select(AuthSession))
        family.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()
    assert api.get("/api/v1/auth/me", headers=headers(pending)).status_code == 401
    assert (
        api.post(
            "/api/v1/auth/refresh", json={"refresh_token": pending["refresh_token"]}
        ).status_code
        == 401
    )


def test_concurrent_registration_does_not_duplicate_accounts(native, pg_engine):
    api, _ = native
    with ThreadPoolExecutor(max_workers=3) as executor:
        responses = list(executor.map(lambda _: register(api), range(3)))
    assert all(row.status_code == 202 for row in responses)
    with Session(pg_engine) as db:
        assert db.scalar(select(func.count()).select_from(User)) == 1
        assert db.scalar(select(func.count()).select_from(AuthAccount)) == 1


def test_password_reset_wins_against_a_prevalidated_login(native, monkeypatch):
    from threading import Event

    from app.modules.auth import service

    api, delivery = native
    verified(native)
    assert (
        api.post("/api/v1/auth/forgot-password", json={"email": "first@example.com"}).status_code
        == 202
    )
    reset = delivery.messages[-1][2]
    original = service.check_password
    checked, proceed = Event(), Event()

    def pause(encoded, password):
        valid = original(encoded, password)
        checked.set()
        assert proceed.wait(20)
        return valid

    monkeypatch.setattr(service, "check_password", pause)
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(login, api)
        try:
            assert checked.wait(20)
            response = api.post(
                "/api/v1/auth/reset-password",
                json={"token": reset, "new_password": "A replacement password with enough length"},
            )
            assert response.status_code == 200
        finally:
            proceed.set()
        assert future.result(timeout=20).status_code == 401


def test_sessions_logout_all_disabled_and_cross_account_revocation(native, pg_engine):
    api, _ = native
    first = verified(native)
    other = verified(native, "other@example.com")
    own_sessions = api.get("/api/v1/auth/sessions", headers=headers(first)).json()
    assert len(own_sessions) == 1 and own_sessions[0]["current"] is True
    assert (
        api.delete(
            "/api/v1/auth/sessions/" + own_sessions[0]["id"], headers=headers(other)
        ).status_code
        == 404
    )
    assert (
        api.post("/api/v1/auth/logout", json={"refresh_token": first["refresh_token"]}).status_code
        == 200
    )
    assert api.get("/api/v1/auth/me", headers=headers(first)).status_code == 401
    again = login(api).json()
    assert api.post("/api/v1/auth/logout-all", headers=headers(again)).status_code == 200
    assert api.get("/api/v1/auth/me", headers=headers(again)).status_code == 401
    with Session(pg_engine) as db:
        account = db.scalar(select(AuthAccount).where(AuthAccount.email == "other@example.com"))
        account.status = "disabled"
        db.commit()
    assert login(api, "other@example.com").status_code == 403
    assert api.get("/api/v1/auth/me", headers=headers(other)).status_code == 403
    assert (
        api.post("/api/v1/auth/refresh", json={"refresh_token": other["refresh_token"]}).status_code
        == 403
    )


def test_expired_actions_sessions_and_persistent_rate_limits(native, pg_engine):
    api, delivery = native
    assert register(api).status_code == 202
    with Session(pg_engine) as db:
        action = db.scalar(select(AuthAction))
        action.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()
    assert (
        api.post("/api/v1/auth/verify-email", json={"token": delivery.messages[-1][2]}).status_code
        == 400
    )
    for _ in range(10):
        assert login(api, password="wrong").status_code == 401
    limited = login(api, password="wrong")
    assert limited.status_code == 429 and limited.headers["retry-after"] == "900"
    assert limited.headers["cache-control"] == "no-store"


def test_missing_email_delivery_and_legacy_account_do_not_leak_or_merge(
    native, pg_engine, db_application
):
    from uuid import uuid4

    from app.modules.auth.email import SmtpDelivery

    api, delivery = native
    db_application.state.auth_delivery = SmtpDelivery(db_application.state.settings)
    assert register(api).status_code == 503
    assert (
        api.post("/api/v1/auth/forgot-password", json={"email": "unknown@example.com"}).status_code
        == 503
    )
    with Session(pg_engine) as db:
        assert db.scalar(select(func.count()).select_from(User)) == 0
        legacy_id = uuid4()
        db.add(
            User(id=legacy_id, email="first@example.com", auth_provider_subject="legacy-preserved")
        )
        db.commit()
    db_application.state.auth_delivery = delivery
    assert register(api).status_code == 202
    with Session(pg_engine) as db:
        assert db.scalar(select(func.count()).select_from(User)) == 1
        assert db.scalar(select(func.count()).select_from(AuthAccount)) == 0
        assert db.get(User, legacy_id).auth_provider_subject == "legacy-preserved"
