from sqlalchemy import case, or_, select, tuple_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, selectinload

from app.db.models import (
    FitnessGoal,
    Food,
    FoodPortion,
    GoalTransition,
    MealLog,
    Recipe,
    UserProfile,
)


class NutritionRepository:
    def __init__(self, session: Session):
        self.session = session

    @staticmethod
    def visible(user_id):
        return or_(Food.created_by_user_id.is_(None), Food.created_by_user_id == user_id)

    def foods(self, user_id, food_ids):
        return self.session.scalars(
            select(Food)
            .where(Food.id.in_(food_ids), self.visible(user_id))
            .options(selectinload(Food.portions))
        ).all()

    def local_search(self, user_id, query, source=None, limit=20, offset=0):
        statement = select(Food).where(
            self.visible(user_id),
            or_(
                Food.name.icontains(query, autoescape=True),
                Food.aliases.contains([query.strip().casefold()]),
            ),
        )
        if source:
            statement = statement.where(Food.source == source)
        priority = case((Food.source == "indian_curated", 0), (Food.source == "custom", 1), else_=2)
        return self.session.scalars(
            statement.order_by(priority, Food.name, Food.id)
            .limit(limit)
            .offset(offset)
            .options(selectinload(Food.portions))
        ).all()

    def barcode(self, user_id, barcode):
        return self.session.scalar(
            select(Food)
            .where(
                self.visible(user_id),
                Food.source == "open_food_facts",
                Food.source_food_id == barcode,
            )
            .options(selectinload(Food.portions))
        )

    def recipes(self, user_id, limit, offset):
        return self.session.scalars(
            select(Recipe)
            .where(Recipe.user_id == user_id)
            .order_by(Recipe.created_at.desc(), Recipe.id)
            .limit(limit)
            .offset(offset)
            .options(selectinload(Recipe.ingredients))
        ).all()

    def import_foods(self, foods):
        # Batch import one bounded provider result, avoiding per-food queries.
        unique = {(food.source, food.source_food_id): food for food in foods}
        if not unique:
            return []
        values = [food.model_dump(exclude={"portions"}) for food in unique.values()]
        statement = (
            insert(Food)
            .values(values)
            .on_conflict_do_nothing(index_elements=[Food.source, Food.source_food_id])
            .returning(Food.id, Food.source, Food.source_food_id)
        )
        for food_id, source, source_id in self.session.execute(statement):
            for portion in unique[source, source_id].portions:
                self.session.add(FoodPortion(food_id=food_id, **portion.model_dump()))
        self.session.flush()
        return self.session.scalars(
            select(Food)
            .where(tuple_(Food.source, Food.source_food_id).in_(list(unique)))
            .options(selectinload(Food.portions))
        ).all()

    def profile(self, user_id):
        return self.session.scalar(select(UserProfile).where(UserProfile.user_id == user_id))

    def active_goal(self, user_id):
        return self.session.scalar(
            select(FitnessGoal).where(
                FitnessGoal.user_id == user_id, FitnessGoal.status == "active"
            )
        )

    def goal_at(self, user_id, end):
        transition = self.session.scalar(
            select(GoalTransition)
            .where(GoalTransition.user_id == user_id, GoalTransition.effective_at < end)
            .order_by(GoalTransition.effective_at.desc())
            .limit(1)
        )
        if transition is None or transition.goal_id is None:
            return None
        return self.session.scalar(
            select(FitnessGoal).where(
                FitnessGoal.user_id == user_id, FitnessGoal.id == transition.goal_id
            )
        )

    def recipe(self, user_id, recipe_id):
        return self.session.scalar(
            select(Recipe)
            .where(Recipe.user_id == user_id, Recipe.id == recipe_id)
            .options(selectinload(Recipe.ingredients))
        )

    def meal(self, user_id, meal_id, lock=False):
        statement = select(MealLog).where(MealLog.user_id == user_id, MealLog.id == meal_id)
        if lock:
            statement = statement.with_for_update()
        return self.session.scalar(statement.options(selectinload(MealLog.items)))

    def meals(self, user_id, start=None, end=None, limit=None, offset=0):
        statement = select(MealLog).where(MealLog.user_id == user_id)
        if start is not None:
            statement = statement.where(MealLog.consumed_at >= start, MealLog.consumed_at < end)
        statement = statement.order_by(MealLog.consumed_at.desc(), MealLog.id).offset(offset)
        if limit is not None:
            statement = statement.limit(limit)
        return self.session.scalars(statement.options(selectinload(MealLog.items))).all()

    def save(self, entity):
        self.session.add(entity)
        self.session.flush()
        return entity

    def delete(self, entity):
        self.session.delete(entity)
        self.session.flush()
