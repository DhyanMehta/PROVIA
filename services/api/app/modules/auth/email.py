"""Optional verified-TLS email delivery; never expose action tokens or provider errors."""

import smtplib
import ssl
from email.message import EmailMessage
from typing import Protocol

import httpx
from pydantic import NameEmail, TypeAdapter, ValidationError

from app.core.exceptions import AppError

SENDER = TypeAdapter(NameEmail)


class DeliveryFailure(AppError):
    def __init__(self, retryable=True):
        super().__init__("EMAIL_UNAVAILABLE", "Email delivery is unavailable", 503)
        self.retryable = retryable


def check_sender(value: str | None):
    """Validate one configured mailbox without claiming domain/provider approval."""
    if not value or len(value) > 512 or any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise AppError("EMAIL_UNAVAILABLE", "Email delivery is not configured", 503)
    try:
        SENDER.validate_python(value)
    except ValidationError:
        raise AppError("EMAIL_UNAVAILABLE", "Email delivery is not configured", 503) from None


class Delivery(Protocol):
    def available(self) -> None: ...

    def send(self, email: str, purpose: str, token: str, *, idempotency_key=None) -> None: ...


def content(purpose: str, token: str) -> tuple[str, str]:
    subject = "PROVIA email verification" if purpose == "verify_email" else "PROVIA password reset"
    route = "verify-email" if purpose == "verify_email" else "reset-password"
    return subject, (
        f"Open PROVIA using this one-time link:\nprovia:///{route}?token={token}\n"
        "If you did not request it, ignore this message."
    )


def create_delivery(settings) -> Delivery:
    return (
        ResendDelivery(settings)
        if settings.auth_email_provider == "resend"
        else SmtpDelivery(settings)
    )


class ResendDelivery:
    """Fixed HTTPS endpoint; no SDK, redirects, automatic retries or response logging."""

    def __init__(self, settings, transport=None):
        self.settings, self.transport = settings, transport

    def available(self):
        secret = self.settings.resend_api_key
        key = secret.get_secret_value() if secret else ""
        if not key or len(key) > 512 or any(not 33 <= ord(char) <= 126 for char in key):
            raise AppError("EMAIL_UNAVAILABLE", "Email delivery is not configured", 503)
        check_sender(self.settings.resend_from)

    def send(self, email: str, purpose: str, token: str, *, idempotency_key=None):
        self.available()
        subject, body = content(purpose, token)
        headers = {"Authorization": "Bearer " + self.settings.resend_api_key.get_secret_value()}
        if idempotency_key is not None:
            headers["Idempotency-Key"] = idempotency_key
        try:
            with httpx.Client(
                timeout=5, verify=True, follow_redirects=False, transport=self.transport
            ) as client:
                response = client.post(
                    "https://api.resend.com/emails",
                    headers=headers,
                    json={
                        "from": self.settings.resend_from,
                        "to": [email],
                        "subject": subject,
                        "text": body,
                    },
                )
                response.raise_for_status()
                result = response.json()
                if (
                    not isinstance(result, dict)
                    or not isinstance(result.get("id"), str)
                    or not result["id"]
                ):
                    raise ValueError
        except httpx.HTTPStatusError as error:
            status = error.response.status_code
            raise DeliveryFailure(status in {408, 409, 429} or status >= 500) from None
        except Exception:
            raise DeliveryFailure() from None


class SmtpDelivery:
    def __init__(self, settings):
        self.settings = settings

    def available(self):
        s = self.settings
        if not all([s.smtp_host, s.smtp_username, s.smtp_password, s.smtp_from]):
            raise AppError("EMAIL_UNAVAILABLE", "Email delivery is not configured", 503)
        if (
            not s.smtp_username.strip()
            or any(char.isspace() or ord(char) < 32 or ord(char) == 127 for char in s.smtp_host)
            or any(char in s.smtp_host for char in "/?#@")
        ):
            raise AppError("EMAIL_UNAVAILABLE", "Email delivery is not configured", 503)
        check_sender(s.smtp_from)

    def send(self, email: str, purpose: str, token: str, *, idempotency_key=None):
        self.available()
        s = self.settings
        try:
            message = EmailMessage()
            message["From"] = s.smtp_from
            message["To"] = email
            message["Subject"], body = content(purpose, token)
            message.set_content(body)
            context = ssl.create_default_context()
            if s.smtp_port == 465:
                with smtplib.SMTP_SSL(
                    s.smtp_host, s.smtp_port, timeout=5, context=context
                ) as client:
                    client.login(s.smtp_username, s.smtp_password.get_secret_value())
                    client.send_message(message)
            else:
                with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=5) as client:
                    client.starttls(context=context)
                    client.login(s.smtp_username, s.smtp_password.get_secret_value())
                    client.send_message(message)
        except (smtplib.SMTPAuthenticationError, smtplib.SMTPRecipientsRefused):
            raise DeliveryFailure(retryable=False) from None
        except Exception:
            raise DeliveryFailure() from None
