from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: str | None
    created_at: datetime
    updated_at: datetime


class UserPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr | None = None
