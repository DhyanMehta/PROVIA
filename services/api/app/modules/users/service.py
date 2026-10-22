from app.modules.users.repository import UserRepository


class UserService:
    def __init__(self, repository: UserRepository):
        self.repository = repository

    def update(self, user, data):
        return self.repository.update(user, data.model_dump(exclude_unset=True))

    def resolve(self, claims: dict):
        # Only a provider-verified email is copied during first provisioning.
        email = claims.get("email") if claims.get("email_verified") is True else None
        if not isinstance(email, str) or len(email) > 320:
            email = None
        return self.repository.resolve(claims["sub"], email)
