from types import SimpleNamespace
from unittest.mock import MagicMock
from xml.etree import ElementTree

import pytest

from app.core.config import Settings
from scripts import run_postgres_tests as runner
from scripts.run_postgres_tests import redact, sanitize_junit


def test_console_redaction_handles_literal_and_repr_escaped_credentials():
    secret = "test-only\\credential\nwith'quotes"
    value = secret + " " + repr(secret) + " safe diagnostic"
    sanitized = redact(value, [secret, "", None])
    assert secret not in sanitized and repr(secret)[1:-1] not in sanitized
    assert "safe diagnostic" in sanitized


def test_generated_bearer_and_jwt_are_redacted_without_configured_secret_values():
    token = "eyJhbGciOiJIUzI1NiJ9.synthetic_payload.synthetic_signature"
    sanitized = redact("Authorization: Bearer " + token + " bare=" + token, [])
    assert token not in sanitized and "synthetic_payload" not in sanitized
    assert "Bearer [redacted]" in sanitized and "[redacted-jwt]" in sanitized


def test_junit_redacts_generated_tokens_without_changing_failure_outcomes(tmp_path):
    token = "eyJhbGciOiJIUzI1NiJ9.synthetic_payload.synthetic_signature"
    path = tmp_path / "generated.xml"
    root = ElementTree.Element("testsuite", tests="1", failures="1")
    case = ElementTree.SubElement(root, "testcase", name="synthetic failure")
    failure = ElementTree.SubElement(case, "failure", message="Bearer " + token)
    failure.text = "Raw generated token=" + token
    ElementTree.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)
    sanitize_junit(["--junitxml=" + str(path)], [])
    content = path.read_text(encoding="utf-8")
    assert token not in content
    assert ElementTree.parse(path).getroot().attrib == {"tests": "1", "failures": "1"}


@pytest.mark.parametrize("joined", [False, True])
def test_junit_redacts_xml_escaped_credentials_without_changing_outcomes(tmp_path, joined):
    secret = "test-only<&>credential"
    path = tmp_path / "result.xml"
    root = ElementTree.Element("testsuite", tests="1", errors="1")
    case = ElementTree.SubElement(root, "testcase", name="connection setup")
    error = ElementTree.SubElement(case, "error", message="failed " + secret)
    error.text = "Trace with " + secret
    error.tail = "provider-key-test-only"
    ElementTree.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)
    arguments = ["--junitxml=" + str(path)] if joined else ["--junit-xml", str(path)]
    sanitize_junit(arguments, [secret, "provider-key-test-only"])
    result = ElementTree.parse(path).getroot()
    content = ElementTree.tostring(result, encoding="unicode")
    assert "credential" not in content and "provider-key-test-only" not in content
    assert result.attrib == {"tests": "1", "errors": "1"}
    assert len(result.findall("testcase/error")) == 1


def test_initialization_errors_never_print_private_configuration(monkeypatch, capsys):
    def invalid_settings():
        raise ValueError("test-only-private-configuration")

    monkeypatch.setattr(runner, "Settings", invalid_settings)
    assert runner.run() == 2
    assert "test-only-private-configuration" not in capsys.readouterr().out


def test_cleanup_failure_is_nonzero_and_never_claims_removal(monkeypatch, capsys):
    settings = Settings(
        _env_file=None,
        app_env="testing",
        direct_database_url="postgresql://test-user:test-only-password@localhost/test",
    )
    admin = MagicMock()
    admin.connect.side_effect = [MagicMock(), RuntimeError("test-only-password")]
    monkeypatch.setattr(runner, "Settings", lambda: settings)
    monkeypatch.setattr(runner, "create_engine", lambda *args, **kwargs: admin)
    monkeypatch.setattr(runner.sys, "argv", ["run_postgres_tests"])
    monkeypatch.setattr(
        runner.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(stdout="1 passed", stderr="", returncode=0),
    )
    assert runner.run() == 2
    output = capsys.readouterr().out
    assert "test-only-password" not in output
    assert "Removed only" not in output
