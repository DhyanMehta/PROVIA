import base64
import hashlib
import json
import re
import shutil
import subprocess

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.modules.auth.email import content
from app.modules.auth.handoff import SCRIPT


@pytest.mark.parametrize("action", ["verify-email", "reset-password"])
def test_handoff_get_is_private_static_and_never_consumes_an_action(client, monkeypatch, action):
    def forbidden(*args, **kwargs):
        raise AssertionError("Landing GET must not consume authentication actions")

    monkeypatch.setattr("app.modules.auth.service.AuthService.consume_action", forbidden)
    token = "synthetic-private-action-token-12345"
    response = client.get(f"/auth/{action}?token={token}&redirect=https://untrusted.example")
    assert response.status_code == 200
    assert response.text == client.get(f"/auth/{action}").text
    assert token not in response.text
    assert "untrusted.example" not in response.text
    assert client.app.state.database._engine is None
    assert f'data-action="{action}"' in response.text
    assert "Android" in response.text
    assert "Open PROVIA" in response.text
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    csp = response.headers["content-security-policy"]
    for directive in (
        "default-src 'none'",
        "connect-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "object-src 'none'",
    ):
        assert directive in csp
    script = re.search(r"<script>(.*?)</script>", response.text, re.DOTALL).group(1)
    digest = base64.b64encode(hashlib.sha256(script.encode()).digest()).decode()
    assert f"script-src 'sha256-{digest}'" in csp
    assert "'unsafe-inline'" not in csp


def test_handoff_does_not_change_frozen_api_contract(client):
    paths = client.get("/openapi.json").json()["paths"]
    assert len(paths) == 67
    assert (
        sum(len(set(value) & {"get", "post", "put", "patch", "delete"}) for value in paths.values())
        == 91
    )
    assert "/auth/verify-email" not in paths
    assert "/auth/reset-password" not in paths
    assert client.get("/auth/not-an-action").status_code == 404
    assert client.post("/auth/verify-email").status_code == 405


@pytest.mark.parametrize("action", ["verify-email", "reset-password"])
def test_head_never_consumes_action_or_initializes_database(client, action):
    assert client.head(f"/auth/{action}").status_code == 405
    assert client.app.state.database._engine is None


@pytest.mark.parametrize(
    "purpose,action", [("verify_email", "verify-email"), ("reset_password", "reset-password")]
)
def test_email_uses_https_handoff_with_fragment_only_action_token(purpose, action):
    token = "synthetic-action-token-123456789"
    subject, body = content(purpose, token)
    assert subject.startswith("PROVIA")
    assert f"https://provia-mag7.onrender.com/auth/{action}#token={token}" in body
    assert "provia:///" not in body
    assert "?token=" not in body
    assert "Open PROVIA" in body


@pytest.mark.parametrize(
    "origin",
    [
        "http://example.com",
        "https://example.com/",
        "https://example.com/path",
        "https://user:password@example.com",
        "https://example.com?x=1",
        "https://example.com#x",
        "https://example.com\\path",
        "https://*.example.com",
        "https://example.com\n",
        "https://example.com:99999",
        "https://example.com:",
        "https://example.com:0",
        "https://%65xample.com",
        "not-a-url",
        "",
    ],
)
def test_action_origin_is_a_trusted_https_origin(origin):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, auth_action_base_url=origin)


def test_configured_action_origin_is_not_derived_from_jwt_issuer():
    settings = Settings(
        _env_file=None,
        auth_token_issuer="urn:provia:issuer",
        auth_action_base_url="https://accounts.example.com",
    )
    assert settings.auth_action_base_url == "https://accounts.example.com"
    assert (
        content("verify_email", "synthetic-action-token-123456789", settings.auth_action_base_url)[
            1
        ].count("https://accounts.example.com/auth/verify-email#token=")
        == 1
    )


def test_actual_handoff_script_validates_fragments_and_waits_for_a_click():
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node is required to execute the browser handoff script")
    harness = r"""
const vm = require('node:vm');
const assert = require('node:assert/strict');
const script = SCRIPT_PLACEHOLDER;
const token = 'synthetic_action-token_123456789';
const invalid = ['', '#token=', '#other=' + token, '#token=' + token + '&x=1',
  '#token=' + token + '&token=' + token, '#token=%61' + token, '#token=' + 'a'.repeat(19),
  '#token=' + 'a'.repeat(513), '#token=' + token + '?next=evil', '#token=' + token + '\n',
  '#token=' + token + '\r\n'];
for (const action of ['verify-email', 'reset-password']) {
  for (const fragment of [...invalid, '#token=' + token]) {
    let click, cleared = false;
    const navigations = [];
    const button = {disabled: true, addEventListener: (event, fn) => {
      assert.equal(event, 'click'); click = fn;
    }};
    const status = {textContent: ''};
    const document = {body: {dataset: {action}}, getElementById: id => {
      assert.ok(cleared, 'fragment must be cleared before reading the DOM');
      return id === 'open-app' ? button : status;
    }};
    const window = {location: {hash: fragment, pathname: '/auth/' + action,
      assign: url => navigations.push(url)}, history: {replaceState: (state, title, path) => {
        assert.equal(path, '/auth/' + action); cleared = true;
      }}};
    vm.runInNewContext(script, {window, document});
    assert.ok(cleared);
    assert.equal(navigations.length, 0, 'loading must never navigate');
    assert.ok(!JSON.stringify({button, status, document}).includes(token));
    if (fragment === '#token=' + token) {
      assert.equal(button.disabled, false); click();
      assert.deepEqual(navigations, ['provia:///' + action + '?token=' + token]);
      window.location.assign = () => { throw new Error('blocked'); };
      assert.doesNotThrow(click);
      assert.ok(status.textContent.includes('install it on Android'));
    } else {
      assert.equal(button.disabled, true);
      assert.equal(click, undefined);
    }
  }
}
"""
    result = subprocess.run(
        [node, "-"],
        input=harness.replace("SCRIPT_PLACEHOLDER", json.dumps(SCRIPT)),
        text=True,
        capture_output=True,
        timeout=10,
        check=False,
    )
    assert result.returncode == 0, result.stderr
