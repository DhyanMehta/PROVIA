from fastapi import APIRouter

from app.core.auth import CurrentUser
from app.db.dependencies import DbSession
from app.modules.users.repository import UserRepository
from app.modules.users.schemas import UserOut, UserPatch
from app.modules.users.service import UserService

router = APIRouter(tags=["users"])


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(data: UserPatch, user: CurrentUser, session: DbSession):
    return UserService(UserRepository(session)).update(user, data)
