"""Static, non-consuming browser handoff to the installed Android application."""

import base64
import hashlib

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(include_in_schema=False)

# Keep the fragment in lexical scope only; clear it before parsing or binding UI.
SCRIPT = """(() => {
  'use strict';
  const fragment = window.location.hash;
  window.history.replaceState(null, '', window.location.pathname);
  const button = document.getElementById('open-app');
  const status = document.getElementById('status');
  const match = /^#token=([A-Za-z0-9_-]{20,512})$/.exec(fragment);
  const action = document.body.dataset.action;
  if (!match || match[0] !== fragment || !['verify-email', 'reset-password'].includes(action)) {
    status.textContent = 'This link is incomplete or invalid. Request a new link in PROVIA.';
    return;
  }
  const token = match[1];
  button.disabled = false;
  button.addEventListener('click', () => {
    status.textContent = 'If PROVIA did not open, install it on Android and reopen this email.';
    try {
      window.location.assign('provia:///' + action + '?token=' + token);
    } catch {
      // Keep the generic fallback visible without exposing a rejected URI.
    }
  });
})();"""

STYLE = """body{font:18px system-ui,sans-serif;margin:0;background:#f4f5ef;color:#183a32}
main{max-width:32rem;margin:12vh auto;padding:2rem}h1{font-size:2rem}
button{font:inherit;background:#183a32;color:white;border:0;border-radius:.6rem;padding:1rem 2rem}
button:disabled{opacity:.5}button:focus-visible{outline:3px solid #b47718;outline-offset:4px}
p{line-height:1.6}"""


def _hash(value: str) -> str:
    return base64.b64encode(hashlib.sha256(value.encode()).digest()).decode()


def handoff(action: str) -> HTMLResponse:
    return HTMLResponse(
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        "<title>Open PROVIA</title><style>" + STYLE + "</style></head>"
        f'<body data-action="{action}"><main><h1>Continue in PROVIA</h1>'
        "<p>Open the installed PROVIA app on your Android device to continue.</p>"
        '<button id="open-app" type="button" disabled>Open PROVIA</button>'
        '<p id="status" role="status">Your link will be handled in the app.</p>'
        "<noscript><p>Enable JavaScript and reopen the link from your email.</p></noscript>"
        "</main><script>" + SCRIPT + "</script></body></html>",
        headers={
            "Cache-Control": "no-store",
            "Pragma": "no-cache",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Content-Security-Policy": (
                "default-src 'none'; "
                f"script-src 'sha256-{_hash(SCRIPT)}'; style-src 'sha256-{_hash(STYLE)}'; "
                "connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; "
                "form-action 'none'; object-src 'none'"
            ),
        },
    )


@router.get("/auth/verify-email", response_class=HTMLResponse)
def verify_email_handoff() -> HTMLResponse:
    return handoff("verify-email")


@router.get("/auth/reset-password", response_class=HTMLResponse)
def reset_password_handoff() -> HTMLResponse:
    return handoff("reset-password")
