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
