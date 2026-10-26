"""Optional synchronous SMTP delivery over verified TLS; no token logging or API fallback."""

import smtplib
import ssl
from email.message import EmailMessage
from typing import Protocol

import httpx

from app.core.exceptions import AppError


class Delivery(Protocol):
    def available(self) -> None: ...

    def send(self, email: str, purpose: str, token: str) -> None: ...


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
        if not self.settings.resend_api_key or not self.settings.resend_from:
            raise AppError("EMAIL_UNAVAILABLE", "Email delivery is not configured", 503)

    def send(self, email: str, purpose: str, token: str):
        self.available()
        subject, body = content(purpose, token)
        try:
            with httpx.Client(
                timeout=5, follow_redirects=False, transport=self.transport
            ) as client:
                response = client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": "Bearer " + self.settings.resend_api_key.get_secret_value()
                    },
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
        except Exception:
            raise AppError("EMAIL_UNAVAILABLE", "Email delivery is unavailable", 503) from None


class SmtpDelivery:
    def __init__(self, settings):
        self.settings = settings

    def available(self):
        s = self.settings
        if not all([s.smtp_host, s.smtp_username, s.smtp_password, s.smtp_from]):
            raise AppError("EMAIL_UNAVAILABLE", "Email delivery is not configured", 503)

    def send(self, email: str, purpose: str, token: str):
        self.available()
        s = self.settings
        message = EmailMessage()
        message["From"] = s.smtp_from
        message["To"] = email
        message["Subject"], body = content(purpose, token)
        message.set_content(body)
        try:
            context = ssl.create_default_context()
            if s.smtp_port == 465:
                client = smtplib.SMTP_SSL(s.smtp_host, s.smtp_port, timeout=5, context=context)
            else:
                client = smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=5)
                client.starttls(context=context)
            with client:
                client.login(s.smtp_username, s.smtp_password.get_secret_value())
                client.send_message(message)
        except Exception:
            raise AppError("EMAIL_UNAVAILABLE", "Email delivery is unavailable", 503) from None
