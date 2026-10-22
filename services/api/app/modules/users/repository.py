from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db.models import User


class UserRepository:
    def __init__(self, session: Session):
        self.session = session

    def update(self, user: User, values: dict):
        for key, value in values.items():
            setattr(user, key, value)
        self.session.flush()
        return user

    def resolve(self, subject: str, email: str | None) -> User:
        # The unique subject and ON CONFLICT serialize concurrent first logins.
        self.session.execute(
            insert(User)
            .values(auth_provider_subject=subject, email=email)
            .on_conflict_do_nothing(index_elements=[User.auth_provider_subject])
        )
        return self.session.scalar(select(User).where(User.auth_provider_subject == subject))
