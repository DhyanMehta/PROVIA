from app.modules.users.repository import UserRepository


class UserService:
    def __init__(self, repository: UserRepository):
        self.repository = repository

    def update(self, user, data):
        return self.repository.update(user, data.model_dump(exclude_unset=True))
