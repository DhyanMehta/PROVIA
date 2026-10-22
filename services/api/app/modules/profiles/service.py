from decimal import Decimal

from app.core.exceptions import AppError
from app.db.models import FitnessGoal, WeightLog
from app.modules.nutrition.targets import calculate_targets
from app.modules.profiles.repository import ProfileRepository
from app.modules.profiles.schemas import GoalPatch


class ProfileService:
    def __init__(self, repository: ProfileRepository, minimum_calories=Decimal("1500")):
        self.repository = repository
        self.minimum_calories = minimum_calories

    def get_profile(self, user_id):
        profile = self.repository.profile(user_id)
        if profile is None:
            raise AppError("RESOURCE_NOT_FOUND", "Profile was not found", 404)
        return profile

    def put_profile(self, user_id, data):
        self.repository.lock_user(user_id)
        active = self.repository.active_goal(user_id)
        previous = self.repository.profile(user_id)
        if (
            active is not None
            and (previous is None or previous.current_weight_kg != data.current_weight_kg)
            and active.calculation_method == "weight_x_24"
            and active.current_weight_kg_snapshot != data.current_weight_kg
        ):
            calculated = calculate_targets(
                data.current_weight_kg,
                active.target_weight_kg,
                active.selected_deficit_kcal,
                self.minimum_calories,
            )
            self.repository.pause_active(user_id)
            self.save_goal(
                FitnessGoal(
                    user_id=user_id,
                    goal_type=active.goal_type,
                    status="active",
                    daily_steps_target=active.daily_steps_target,
                    **calculated,
                )
            )
        return self.repository.put_profile(user_id, data.model_dump())

    def goals(self, user_id, limit, offset):
        return self.repository.goals(user_id, limit, offset)

    def weights(self, user_id, limit, offset):
        return self.repository.weights(user_id, limit, offset)

    def create_goal(self, user_id, data):
        self.repository.lock_user(user_id)
        weight = data.current_weight_kg
        if weight is None:
            profile = self.repository.profile(user_id)
            if profile is None:
                raise AppError(
                    "CURRENT_WEIGHT_REQUIRED",
                    "Provide current weight or create a profile first",
                    422,
                )
            weight = profile.current_weight_kg
        calculated = calculate_targets(
            weight, data.target_weight_kg, data.selected_deficit_kcal, self.minimum_calories
        )
        if data.status == "active":
            self.repository.pause_active(user_id)
        return self.save_goal(
            FitnessGoal(
                user_id=user_id,
                goal_type=data.goal_type,
                status=data.status,
                daily_steps_target=data.daily_steps_target,
                **calculated,
            )
        )

    def update_goal(self, user_id, goal_id, data):
        self.repository.lock_user(user_id)
        goal = self.repository.goal(user_id, goal_id)
        if goal is None:
            raise AppError("RESOURCE_NOT_FOUND", "Goal was not found", 404)
        values = data.model_dump(exclude_unset=True)
        inputs = {"current_weight_kg", "target_weight_kg", "selected_deficit_kcal"}
        if inputs.intersection(values):
            weight = values.get("current_weight_kg", goal.current_weight_kg_snapshot)
            target = values.get("target_weight_kg", goal.target_weight_kg)
            deficit = values.get("selected_deficit_kcal", goal.selected_deficit_kcal)
            if any(value is None for value in (weight, target, deficit)):
                raise AppError(
                    "CALCULATION_INPUTS_REQUIRED", "Supply all inputs to revise a legacy goal", 422
                )
            calculated = calculate_targets(weight, target, deficit, self.minimum_calories)
            status = data.status or goal.status
            if status == "active":
                self.repository.pause_active(user_id)
            elif goal.status == "active":
                goal.status = "paused"
                self.repository.record_transition(user_id, None)
            return self.save_goal(
                FitnessGoal(
                    user_id=user_id,
                    goal_type=data.goal_type or goal.goal_type,
                    status=status,
                    daily_steps_target=values.get("daily_steps_target", goal.daily_steps_target),
                    **calculated,
                )
            )
        was_active = goal.status == "active"
        if data.status == "active":
            if not goal.calculation_method:
                raise AppError(
                    "CALCULATION_INPUTS_REQUIRED",
                    "Supply current weight, target weight and deficit to activate a legacy goal",
                    422,
                )
            if goal.calculation_method:
                calculate_targets(
                    goal.current_weight_kg_snapshot,
                    goal.target_weight_kg,
                    goal.selected_deficit_kcal,
                    self.minimum_calories,
                )
            self.repository.pause_active(user_id, except_id=goal_id)
        for key, value in data.model_dump(exclude_unset=True).items():
            setattr(goal, key, value)
        saved = self.repository.save(goal)
        if data.status == "active" and not was_active:
            self.repository.record_transition(user_id, saved.id)
        elif was_active and saved.status != "active":
            self.repository.record_transition(user_id, None)
        return saved

    def add_weight(self, user_id, data):
        return self.repository.save(WeightLog(user_id=user_id, **data.model_dump()))

    def save_goal(self, goal):
        saved = self.repository.save(goal)
        if saved.status == "active":
            self.repository.record_transition(saved.user_id, saved.id)
        return saved

    def weight_preview(self, user_id, weight_id):
        weight = self.repository.weight(user_id, weight_id)
        if weight is None:
            raise AppError("RESOURCE_NOT_FOUND", "Weight log was not found", 404)
        goal = self.repository.active_goal(user_id)
        if goal is None or goal.target_weight_kg is None or goal.selected_deficit_kcal is None:
            raise AppError(
                "CALCULATION_INPUTS_REQUIRED",
                "Create a calculated goal before using a weight log",
                422,
            )
        values = calculate_targets(
            weight.weight_kg,
            goal.target_weight_kg,
            goal.selected_deficit_kcal,
            self.minimum_calories,
        )
        return {**values, "base_goal_id": goal.id, "weight_log_id": weight.id}

    def apply_weight(self, user_id, weight_id, expected_goal_id):
        self.repository.lock_user(user_id)
        preview = self.weight_preview(user_id, weight_id)
        if preview["base_goal_id"] != expected_goal_id:
            raise AppError(
                "GOAL_CHANGED", "The active goal changed; preview again before confirming", 409
            )
        return self.update_goal(
            user_id,
            expected_goal_id,
            GoalPatch(current_weight_kg=preview["current_weight_kg_snapshot"]),
        )
