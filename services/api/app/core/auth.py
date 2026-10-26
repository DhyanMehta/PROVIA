"""Stable authorization seam: only persisted first-party sessions identify users."""

from typing import Annotated

from fastapi import Depends

from app.db.models import User
from app.modules.auth.dependencies import Identity, verified_user


def get_current_user(principal: Identity) -> User:
    return verified_user(principal)


CurrentUser = Annotated[User, Depends(get_current_user, scope="function")]
