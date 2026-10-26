from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StrictStr, field_validator

Password = Annotated[StrictStr, Field(min_length=15, max_length=128)]
Token = Annotated[StrictStr, Field(min_length=20, max_length=512)]


class AuthInput(BaseModel):
    # Passwords are preserved exactly, unlike the business Input base.
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)

    @field_validator("email", check_fields=False)
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return str(value).casefold()

    @field_validator("password", "new_password", check_fields=False)
    @classmethod
    def bound_password(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 512:
            raise ValueError("Password is too long")
        return value


class RegisterIn(AuthInput):
    name: Annotated[StrictStr, Field(min_length=1, max_length=100)]
    email: EmailStr
    password: Password

    @field_validator("name")
    @classmethod
    def valid_name(cls, value):
        if not value.strip():
            raise ValueError("Name is required")
        return value.strip()


class LoginIn(AuthInput):
    email: EmailStr
    password: Annotated[StrictStr, Field(min_length=1, max_length=128)]
    device_label: Annotated[StrictStr, Field(max_length=80)] | None = None


class EmailIn(AuthInput):
    email: EmailStr


class ActionIn(AuthInput):
    token: Token


class ResetIn(ActionIn):
    new_password: Password


class ChangeIn(AuthInput):
    password: Annotated[StrictStr, Field(min_length=1, max_length=128)]
    new_password: Password


class RefreshIn(AuthInput):
    refresh_token: Token


class AccountOut(BaseModel):
    id: UUID
    email: str
    name: str
    email_verified: bool
    status: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: AccountOut


class MessageOut(BaseModel):
    message: str


class SessionOut(BaseModel):
    id: UUID
    created_at: datetime
    expires_at: datetime
    last_used_at: datetime
    device_label: str | None
    current: bool
