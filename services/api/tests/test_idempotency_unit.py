from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from pydantic import AwareDatetime, Field
from starlette.datastructures import Headers

from app.core.exceptions import AppError
from app.modules.common import Input
from app.modules.idempotency import create_once, fingerprint, request_key


class RetryInput(Input):
    amount_ml: int
    consumed_at: AwareDatetime = Field(default_factory=lambda: datetime.now(UTC))


def test_retry_fingerprint_ignores_generated_timestamp_but_retains_explicit_body():
    first = RetryInput(amount_ml=250)
    second = RetryInput(amount_ml=250)
    assert fingerprint(first) == fingerprint(second)
    assert fingerprint(first) != fingerprint(RetryInput(amount_ml=251))
    explicit = RetryInput(amount_ml=250, consumed_at=datetime(2026, 1, 1, tzinfo=UTC))
    assert fingerprint(explicit) != fingerprint(first)


def test_retry_fingerprint_binds_parent_resource_for_nested_operations():
    data = RetryInput(amount_ml=250)
    assert fingerprint(data, "parent-a") != fingerprint(data, "parent-b")
    assert fingerprint(data, "parent-a") != fingerprint(data)


def test_receipt_and_resource_share_request_transaction_and_owner_scope():
    repository = MagicMock()
    repository.session.get.return_value = None
    user, key, row = uuid4(), uuid4(), SimpleNamespace(id=uuid4())
    data = RetryInput(amount_ml=250)
    create, lookup = MagicMock(return_value=row), MagicMock()
    assert create_once(repository, user, "water-log", key, data, create, lookup) is row
    receipt = repository.session.add.call_args.args[0]
    assert (receipt.user_id, receipt.operation, receipt.key) == (user, "water-log", key)
    assert receipt.fingerprint == fingerprint(data) and receipt.resource_id == row.id
    repository.session.commit.assert_not_called()
    lookup.assert_not_called()
    repository.session.get.assert_called_once_with(type(receipt), (user, "water-log", key))


def test_matching_replay_reads_current_owned_resource_without_recreating():
    repository = MagicMock()
    data, row_id = RetryInput(amount_ml=250), uuid4()
    repository.session.get.return_value = SimpleNamespace(
        fingerprint=fingerprint(data), resource_id=row_id
    )
    row = SimpleNamespace(id=row_id)
    create, lookup = MagicMock(), MagicMock(return_value=row)
    assert create_once(repository, uuid4(), "water-log", uuid4(), data, create, lookup) is row
    create.assert_not_called()
    lookup.assert_called_once_with(row_id)
    repository.session.add.assert_not_called()


@pytest.mark.parametrize("deleted", [False, True])
def test_changed_or_deleted_replay_is_conflict(deleted):
    repository = MagicMock()
    data = RetryInput(amount_ml=250)
    repository.session.get.return_value = SimpleNamespace(
        fingerprint=fingerprint(data) if deleted else "different", resource_id=uuid4()
    )
    create, lookup = MagicMock(), MagicMock(return_value=None)
    with pytest.raises(AppError) as caught:
        create_once(repository, uuid4(), "water-log", uuid4(), data, create, lookup)
    assert caught.value.status_code == 409
    assert caught.value.code == (
        "IDEMPOTENCY_RESOURCE_DELETED" if deleted else "IDEMPOTENCY_CONFLICT"
    )
    create.assert_not_called()


def test_lookup_failure_does_not_hide_infrastructure_error():
    repository = MagicMock()
    data = RetryInput(amount_ml=250)
    repository.session.get.return_value = SimpleNamespace(
        fingerprint=fingerprint(data), resource_id=uuid4()
    )
    lookup = MagicMock(side_effect=AppError("DATABASE_UNAVAILABLE", "Unavailable", 503))
    with pytest.raises(AppError) as caught:
        create_once(repository, uuid4(), "water-log", uuid4(), data, MagicMock(), lookup)
    assert caught.value.status_code == 503


def test_missing_key_preserves_existing_create_behavior():
    repository, create = MagicMock(), MagicMock(return_value="created")
    assert create_once(repository, uuid4(), "water-log", None, None, create, None) == "created"
    repository.session.execute.assert_not_called()


def test_duplicate_retry_headers_rejected():
    request = SimpleNamespace(
        headers=Headers(raw=[(b"idempotency-key", b"one"), (b"idempotency-key", b"two")])
    )
    with pytest.raises(AppError) as caught:
        request_key(request, uuid4())
    assert caught.value.status_code == 422
