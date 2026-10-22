from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db.models import FitnessGoal, User, UserProfile, WeightLog


class ProfileRepository:
    def __init__(self, session: Session):
        self.session = session

    def profile(self, user_id: UUID):
        return self.session.scalar(select(UserProfile).where(UserProfile.user_id == user_id))

    def put_profile(self, user_id: UUID, values: dict):
        statement = insert(UserProfile).values(user_id=user_id, **values)
        statement = statement.on_conflict_do_update(
            index_elements=[UserProfile.user_id], set_={**values, "updated_at": func.now()}
        ).returning(UserProfile)
        return self.session.scalar(statement.execution_options(populate_existing=True))

    def lock_user(self, user_id: UUID):
        self.session.execute(select(User.id).where(User.id == user_id).with_for_update())

    def pause_active(self, user_id: UUID, except_id: UUID | None = None):
        statement = update(FitnessGoal).where(
            FitnessGoal.user_id == user_id, FitnessGoal.status == "active"
        )
        if except_id:
            statement = statement.where(FitnessGoal.id != except_id)
        self.session.execute(statement.values(status="paused"))

    def goal(self, user_id: UUID, goal_id: UUID):
        return self.session.scalar(
            select(FitnessGoal).where(FitnessGoal.id == goal_id, FitnessGoal.user_id == user_id)
        )

    def active_goal(self, user_id: UUID):
        return self.session.scalar(
            select(FitnessGoal).where(
                FitnessGoal.user_id == user_id, FitnessGoal.status == "active"
            )
        )

    def goals(self, user_id: UUID, limit: int, offset: int):
        return self.session.scalars(
            select(FitnessGoal)
            .where(FitnessGoal.user_id == user_id)
            .order_by(FitnessGoal.created_at.desc(), FitnessGoal.id)
            .limit(limit)
            .offset(offset)
        ).all()

    def weights(self, user_id: UUID, limit: int, offset: int):
        return self.session.scalars(
            select(WeightLog)
            .where(WeightLog.user_id == user_id)
            .order_by(WeightLog.recorded_at.desc(), WeightLog.id)
            .limit(limit)
            .offset(offset)
        ).all()

    def save(self, value):
        self.session.add(value)
        self.session.flush()
        return value
