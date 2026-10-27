import json
import smtplib
import ssl
from unittest.mock import MagicMock

import httpx
import pytest

from app.core.config import Settings
from app.core.exceptions import AppError
from app.modules.auth.email import ResendDelivery, SmtpDelivery, create_delivery


def settings(**values):
    return Settings(
        _env_file=None,
        **{
            "auth_email_provider": "resend",
            "resend_api_key": "test-only-key",
            "resend_from": "PROVIA <sender@example.com>",
            **values,
        },
    )


def test_delivery_selection_and_missing_configuration():
    assert isinstance(create_delivery(settings()), ResendDelivery)
    assert isinstance(create_delivery(Settings(_env_file=None)), SmtpDelivery)
    with pytest.raises(AppError) as error:
        create_delivery(Settings(_env_file=None, auth_email_provider="resend")).available()
    assert error.value.code == "EMAIL_UNAVAILABLE"


@pytest.mark.parametrize(
    "purpose,route,subject",
    [
        ("verify_email", "verify-email", "PROVIA email verification"),
        ("reset_password", "reset-password", "PROVIA password reset"),
    ],
)
def test_https_delivery_uses_fixed_endpoint_and_one_time_mobile_link(purpose, route, subject):
    requests = []

    def handle(request):
        requests.append(request)
        assert str(request.url) == "https://api.resend.com/emails"
        assert request.headers["authorization"] == "Bearer test-only-key"
        body = json.loads(request.content)
        assert body["to"] == ["recipient@example.com"]
        assert body["from"] == "PROVIA <sender@example.com>"
        assert body["subject"] == subject
        assert f"provia:///{route}?token=test-only-action" in body["text"]
        return httpx.Response(200, json={"id": "provider-message-id"})

    ResendDelivery(settings(), httpx.MockTransport(handle)).send(
        "recipient@example.com", purpose, "test-only-action"
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


@pytest.mark.parametrize(
    "sender",
    [
        "not-an-address",
        "one@example.com, two@example.com",
        "PROVIA <sender@example.com>\r\nBcc: victim@example.com",
        "sender@example.com\0",
        "sender@example.com\n",
        " ",
        "x" * 513,
    ],
)
def test_invalid_sender_blocks_before_any_provider_request(sender):
    request = MagicMock()
    delivery = ResendDelivery(settings(resend_from=sender), httpx.MockTransport(request))
    with pytest.raises(AppError) as error:
        delivery.send("recipient@example.com", "verify_email", "test-only-action")
    assert error.value.status_code == 503 and error.value.code == "EMAIL_UNAVAILABLE"
    request.assert_not_called()


@pytest.mark.parametrize("key", ["", " ", "key with spaces", "key\r\ninjection", "é", "x" * 513])
def test_malformed_key_blocks_before_any_provider_request(key):
    request = MagicMock()
    delivery = ResendDelivery(settings(resend_api_key=key), httpx.MockTransport(request))
    with pytest.raises(AppError) as error:
        delivery.send("recipient@example.com", "reset_password", "test-only-action")
    assert error.value.status_code == 503 and error.value.code == "EMAIL_UNAVAILABLE"
    request.assert_not_called()


def test_https_delivery_enforces_tls_no_redirect_and_bounded_timeout(monkeypatch):
    factory = httpx.Client
    options = {}

    def client(**values):
        options.update(values)
        return factory(**values)

    monkeypatch.setattr(httpx, "Client", client)
    delivery = ResendDelivery(
        settings(), httpx.MockTransport(lambda request: httpx.Response(200, json={"id": "mock-id"}))
    )
    delivery.send("recipient@example.com", "verify_email", "test-only-action")
    assert options["verify"] is True
    assert options["follow_redirects"] is False and options["timeout"] == 5


def smtp_settings(**values):
    return Settings(
        _env_file=None,
        **{
            "smtp_host": "smtp.example.com",
            "smtp_username": "smtp-user",
            "smtp_password": "test-only-password",
            "smtp_from": "PROVIA <sender@example.com>",
            "smtp_port": 587,
            **values,
        },
    )


@pytest.mark.parametrize(
    "values",
    [
        {"smtp_host": "https://smtp.example.com"},
        {"smtp_host": "smtp.example.com\n"},
        {"smtp_username": " "},
        {"smtp_from": "bad-sender"},
    ],
)
def test_smtp_invalid_configuration_is_blocked(values):
    with pytest.raises(AppError) as error:
        SmtpDelivery(smtp_settings(**values)).available()
    assert error.value.code == "EMAIL_UNAVAILABLE"


def test_smtp_starttls_failure_closes_connection_before_any_credentials(monkeypatch):
    connection = MagicMock()
    client = connection.__enter__.return_value
    client.starttls.side_effect = smtplib.SMTPException("private-provider-details")
    monkeypatch.setattr(smtplib, "SMTP", MagicMock(return_value=connection))
    with pytest.raises(AppError) as error:
        SmtpDelivery(smtp_settings()).send(
            "recipient@example.com", "verify_email", "test-only-action"
        )
    assert error.value.code == "EMAIL_UNAVAILABLE"
    connection.__exit__.assert_called_once()
    client.login.assert_not_called()
    client.send_message.assert_not_called()


def test_smtp_ssl_uses_verified_context(monkeypatch):
    connection = MagicMock()
    factory = MagicMock(return_value=connection)
    monkeypatch.setattr(smtplib, "SMTP_SSL", factory)
    SmtpDelivery(smtp_settings(smtp_port=465)).send(
        "recipient@example.com", "reset_password", "test-only-action"
    )
    context = factory.call_args.kwargs["context"]
    assert context.check_hostname and context.verify_mode == ssl.CERT_REQUIRED
    connection.__enter__.return_value.send_message.assert_called_once()
