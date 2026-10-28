"""Atomic, owner-scoped retry receipts for mobile create operations.

The caller's normal request transaction commits both resource and receipt. There is
no independent commit, background work or plaintext request storage here.
"""

import hashlib
import json
from collections.abc import Mapping
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, Request
from sqlalchemy import select

from app.core.exceptions import AppError
from app.db.models import RequestReceipt, User


def request_key(
    request: Request,
    key: Annotated[UUID | None, Header(alias="Idempotency-Key")] = None,
) -> UUID | None:
    if len(request.headers.getlist("idempotency-key")) > 1:
        raise AppError("INVALID_IDEMPOTENCY_KEY", "Supply one Idempotency-Key header", 422)
    return key


IdempotencyKey = Annotated[UUID | None, Depends(request_key)]


def fingerprint(data, context=None) -> str:
    # Generated timestamp defaults must not change the identity of an omitted field.
    # Clients must retry the same explicit body, including presence of optional fields.
    body = data.model_dump(mode="json", exclude_unset=True)
    payload = json.dumps(
        {"body": body, "context": context} if context is not None else body,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        allow_nan=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def create_once(repository, user_id, operation, key, data, create, lookup, *, context=None):
    if key is None:
        return create()
    session = repository.session
    # Same lock order as profile, workout and tracking writes. It serializes two
    # requests before either can create a resource or observe an uncommitted receipt.
    session.execute(select(User.id).where(User.id == user_id).with_for_update())
    identity = (user_id, operation, key)
    existing = session.get(RequestReceipt, identity)
    digest = fingerprint(data, context)
    if existing:
        if existing.fingerprint != digest:
            raise AppError(
                "IDEMPOTENCY_CONFLICT", "Retry key was already used with a different request", 409
            )
        try:
            resource = lookup(existing.resource_id)
        except AppError as error:
            if error.status_code != 404:
                raise
            resource = None
        if resource is None:
            raise AppError(
                "IDEMPOTENCY_RESOURCE_DELETED", "The original resource is no longer available", 409
            )
        return resource
    resource = create()
    session.add(
        RequestReceipt(
            user_id=user_id,
            operation=operation,
            key=key,
            fingerprint=digest,
            resource_id=resource["id"] if isinstance(resource, Mapping) else resource.id,
        )
    )
    session.flush()
    return resource
