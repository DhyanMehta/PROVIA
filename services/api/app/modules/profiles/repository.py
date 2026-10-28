from datetime import timedelta
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db.models import FitnessGoal, GoalTransition, User, UserProfile, WeightLog


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

    def record_transition(self, user_id, goal_id):
        # Caller holds the user lock. Clock time (not transaction-start time) preserves
        # order even when a request waited for an earlier transaction to commit.
        now = self.session.scalar(select(func.clock_timestamp()))
        latest = self.session.scalar(
            select(func.max(GoalTransition.effective_at)).where(GoalTransition.user_id == user_id)
        )
        if latest is not None and now <= latest:
            now = latest + timedelta(microseconds=1)
        self.save(GoalTransition(user_id=user_id, goal_id=goal_id, effective_at=now))

    def weight(self, user_id, weight_id, lock=False):
        query = select(WeightLog).where(WeightLog.user_id == user_id, WeightLog.id == weight_id)
        if lock:
            query = query.with_for_update().execution_options(populate_existing=True)
        return self.session.scalar(query)

    def external_weight(self, user_id, source, external_id):
        return self.session.scalar(
            select(WeightLog).where(
                WeightLog.user_id == user_id,
                WeightLog.source == source,
                WeightLog.external_id == external_id,
            )
        )

    def delete(self, row):
        self.session.delete(row)
        self.session.flush()

    def goals(self, user_id: UUID, limit: int, offset: int):
        return self.session.scalars(
            select(FitnessGoal)
            .where(FitnessGoal.user_id == user_id)
            .order_by(FitnessGoal.created_at.desc(), FitnessGoal.id)
            .limit(limit)
            .offset(offset)
        ).all()

    def weights(self, user_id: UUID, limit: int, offset: int, begin=None, finish=None):
        query = select(WeightLog).where(WeightLog.user_id == user_id)
        if begin is not None:
            query = query.where(WeightLog.recorded_at >= begin, WeightLog.recorded_at < finish)
        return self.session.scalars(
            query.order_by(WeightLog.recorded_at.desc(), WeightLog.id).limit(limit).offset(offset)
        ).all()

    def save(self, value):
        self.session.add(value)
        self.session.flush()
        return value
