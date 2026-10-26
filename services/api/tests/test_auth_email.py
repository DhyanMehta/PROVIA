import json

import httpx
import pytest

from app.core.config import Settings
from app.core.exceptions import AppError
from app.modules.auth.email import ResendDelivery, SmtpDelivery, create_delivery


def settings(**values):
    return Settings(
        _env_file=None,
        auth_email_provider="resend",
        resend_api_key="test-only-key",
        resend_from="PROVIA <sender@example.com>",
        **values,
    )


def test_delivery_selection_and_missing_configuration():
    assert isinstance(create_delivery(settings()), ResendDelivery)
    assert isinstance(create_delivery(Settings(_env_file=None)), SmtpDelivery)
    with pytest.raises(AppError) as error:
        create_delivery(Settings(_env_file=None, auth_email_provider="resend")).available()
    assert error.value.code == "EMAIL_UNAVAILABLE"


def test_https_delivery_uses_fixed_endpoint_and_one_time_mobile_link():
    requests = []

    def handle(request):
        requests.append(request)
        assert str(request.url) == "https://api.resend.com/emails"
        assert request.headers["authorization"] == "Bearer test-only-key"
        body = json.loads(request.content)
        assert body["to"] == ["recipient@example.com"]
        assert "provia:///verify-email?token=test-only-action" in body["text"]
        return httpx.Response(200, json={"id": "provider-message-id"})

    ResendDelivery(settings(), httpx.MockTransport(handle)).send(
        "recipient@example.com", "verify_email", "test-only-action"
    )
    assert len(requests) == 1


@pytest.mark.parametrize("failure", ["redirect", "quota", "server", "timeout", "malformed"])
def test_delivery_failure_is_sanitized_and_never_retried(failure):
    count = 0

    def handle(request):
        nonlocal count
        count += 1
        if failure == "timeout":
            raise httpx.ReadTimeout("private-provider-details", request=request)
        status = {"redirect": 307, "quota": 429, "server": 503, "malformed": 200}[failure]
        return httpx.Response(
            status,
            headers={"Location": "https://untrusted.example"},
            json={"private": "private-provider-details"},
        )

    with pytest.raises(AppError) as error:
        ResendDelivery(settings(), httpx.MockTransport(handle)).send(
            "recipient@example.com", "reset_password", "test-only-action"
        )
    assert error.value.code == "EMAIL_UNAVAILABLE" and error.value.status_code == 503
    assert "private-provider-details" not in str(error.value)
    assert count == 1
