from collections import defaultdict
from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.db.models import SleepSession, WaterLog
from app.modules.common import day_bounds
from app.modules.nutrition.calculations import totals
from app.modules.nutrition.repository import NutritionRepository
from app.modules.nutrition.service import NutritionService
from app.modules.tracking.schemas import ActivityOut, SleepOut, WaterOut
from app.modules.tracking.service import date_range
from app.modules.workouts.schemas import SetOut


def qualifying(row):
    return row.is_completed and not row.is_skipped and row.kind == "working"


def volume(rows):
    return sum((row.weight_kg * row.reps for row in rows if qualifying(row)), Decimal(0))


def grouped(rows, key):
    result = defaultdict(list)
    for row in rows:
        result[key(row)].append(row)
    return result


class InsightsService:
    def __init__(self, repository):
        self.repository = repository

    def workouts(self, user_id, start=None, end=None, exercise_id=None):
        timezone = self.repository.timezone(user_id)
        first, last, begin, finish = date_range(start, end, timezone)
        zone = ZoneInfo(timezone)
        sessions, sets = self.repository.workouts(user_id, begin, finish)
        sets_by_session = grouped(sets, lambda row: row.workout_session_id)
        history = []
        prs = defaultdict(
            lambda: {
                "heaviest_weight_kg": None,
                "highest_reps": None,
                "highest_session_volume_kg": Decimal(0),
            }
        )
        for session in sorted(sessions, key=lambda row: (row.started_at, row.id)):
            if session.status != "completed":
                continue
            entries = sets_by_session[session.id]
            if exercise_id is not None:
                entries = [row for row in entries if row.exercise_id == exercise_id]
                if not entries:
                    continue
            for ex_id, ex_sets in grouped(
                [row for row in entries if qualifying(row)], lambda row: row.exercise_id
            ).items():
                record = prs[str(ex_id)]
                record["heaviest_weight_kg"] = max(
                    record["heaviest_weight_kg"] or Decimal(0),
                    max(row.weight_kg for row in ex_sets),
                )
                record["highest_reps"] = max(
                    record["highest_reps"] or 0, max(row.reps for row in ex_sets)
                )
                record["highest_session_volume_kg"] = max(
                    record["highest_session_volume_kg"], volume(ex_sets)
                )
            history.append(
                {
                    "id": session.id,
                    "date": session.started_at.astimezone(zone).date(),
                    "started_at": session.started_at,
                    "duration_seconds": (session.completed_at - session.started_at).total_seconds()
                    if session.completed_at
                    else None,
                    "volume_kg": volume(entries),
                    "sets": [
                        SetOut.model_validate(row).model_dump(mode="json")
                        for row in sorted(
                            entries, key=lambda row: (row.exercise_id, row.set_number)
                        )
                    ]
                    if exercise_id is not None
                    else None,
                }
            )
        daily = grouped(history, lambda row: row["date"])
        points = []
        for index in range((last - first).days + 1):
            day = first + timedelta(days=index)
            rows = daily.get(day, [])
            points.append(
                {
                    "date": day,
                    "count": len(rows),
                    "volume_kg": sum((row["volume_kg"] for row in rows), Decimal(0)),
                }
            )
        today = datetime.now(zone).date()
        week = today - timedelta(days=today.weekday())
        month = today.replace(day=1)
        return {
            "start_date": first,
            "end_date": last,
            "timezone": timezone,
            "total_workouts": len(history),
            "workouts_this_week": self.repository.workout_count(
                user_id, day_bounds(week, timezone)[0], day_bounds(today, timezone)[1], exercise_id
            ),
            "workouts_this_month": self.repository.workout_count(
                user_id, day_bounds(month, timezone)[0], day_bounds(today, timezone)[1], exercise_id
            ),
            "total_duration_seconds": sum(row["duration_seconds"] for row in history)
            if all(row["duration_seconds"] is not None for row in history)
            else None,
            "total_volume_kg": sum((row["volume_kg"] for row in history), Decimal(0)),
            "active_days": len(daily),
            "consistency_ratio": Decimal(len(daily)) / Decimal((last - first).days + 1),
            "history": history,
            "daily": points,
            "personal_records": dict(prs),
        }

    def overview(self, user_id, start=None, end=None):
        timezone = self.repository.timezone(user_id)
        first, last, begin, finish = date_range(start, end, timezone)
        zone = ZoneInfo(timezone)
        rows = self.repository.tracking(user_id, first, last, begin, finish)
        water = grouped(rows["water"], lambda row: row.consumed_at.astimezone(zone).date())
        sleep = grouped(rows["sleep"], lambda row: row.ended_at.astimezone(zone).date())
        activities = {row.activity_date: row for row in rows["activity"]}
        targets = self.repository.targets(user_id, first, last)
        meals, items, transitions, goals = self.repository.nutrition(user_id, begin, finish)
        meals_by_day = grouped(meals, lambda row: row.consumed_at.astimezone(zone).date())
        items_by_meal = grouped(items, lambda row: row.meal_log_id)
        target_index = transition_index = 0
        target = goal = None
        daily = []
        for index in range((last - first).days + 1):
            day = first + timedelta(days=index)
            day_end = day_bounds(day, timezone)[1]
            while target_index < len(targets) and targets[target_index].effective_date <= day:
                target = targets[target_index].target_ml
                target_index += 1
            while (
                transition_index < len(transitions)
                and transitions[transition_index].effective_at < day_end
            ):
                goal = goals.get(transitions[transition_index].goal_id)
                transition_index += 1
            water_total = sum((row.amount_ml for row in water[day]), Decimal(0))
            food_items = [item for meal in meals_by_day[day] for item in items_by_meal[meal.id]]
            consumed = totals(food_items)["calories_kcal"] if meals_by_day[day] else None
            calories_target = goal.daily_calorie_target if goal else None
            daily.append(
                {
                    "date": day,
                    "water": {
                        "target_ml": target,
                        "consumed_ml": water_total,
                        "remaining_ml": max(target - water_total, Decimal(0))
                        if target is not None
                        else None,
                        "has_logs": bool(water[day]),
                        "target_met": water_total >= target
                        if target is not None and water[day]
                        else None,
                    },
                    "activity": ActivityOut.model_validate(activities[day]).model_dump(mode="json")
                    if day in activities
                    else None,
                    "sleep": {
                        "session_count": len(sleep[day]),
                        "duration_seconds": sum(
                            (row.ended_at - row.started_at).total_seconds() for row in sleep[day]
                        )
                        if sleep[day]
                        else None,
                    },
                    "nutrition": {
                        "has_logs": bool(meals_by_day[day]),
                        "calories_consumed": consumed,
                        "calories_target": calories_target,
                        "goal_id": goal.id if goal else None,
                        "adherence_ratio": consumed / calories_target
                        if consumed is not None and calories_target
                        else None,
                    },
                }
            )
        weights = sorted(rows["weight"], key=lambda row: (row.recorded_at, row.id))
        eligible_water = [row["water"] for row in daily if row["water"]["target_met"] is not None]
        return {
            "start_date": first,
            "end_date": last,
            "timezone": timezone,
            "daily": daily,
            "weight_history": [
                {"id": row.id, "recorded_at": row.recorded_at, "weight_kg": row.weight_kg}
                for row in weights
            ],
            "weight_change_kg": weights[-1].weight_kg - weights[0].weight_kg
            if len(weights) >= 2
            else None,
            "water_consistency": {
                "observed_days_with_target": len(eligible_water),
                "days_met": sum(row["target_met"] for row in eligible_water),
            },
            "workouts": self.workouts(user_id, first, last),
        }

    def dashboard(self, user_id, day=None):
        timezone = self.repository.timezone(user_id)
        day = day or datetime.now(ZoneInfo(timezone)).date()
        data = self.overview(user_id, day, day)
        summary = data["daily"][0]
        end = day_bounds(day, timezone)[1]
        weight = self.repository.latest_weight(user_id, end)
        return {
            "date": day,
            "timezone": timezone,
            "nutrition": NutritionService(NutritionRepository(self.repository.session)).dashboard(
                user_id, day
            ),
            "water": summary["water"],
            "activity": summary["activity"],
            "sleep": summary["sleep"],
            "workouts": data["workouts"],
            "weight": {"weight_kg": weight.weight_kg, "recorded_at": weight.recorded_at}
            if weight
            else None,
        }

    def water_dashboard(self, user_id, day):
        timezone = self.repository.timezone(user_id)
        start, end = day_bounds(day, timezone)
        logs = self.repository.range_records(WaterLog, user_id, WaterLog.consumed_at, start, end)
        target_row = self.repository.target(user_id, day)
        target = target_row.target_ml if target_row else None
        consumed = sum((row.amount_ml for row in logs), Decimal(0))
        return {
            "date": day,
            "timezone": timezone,
            "target_ml": target,
            "consumed_ml": consumed,
            "remaining_ml": max(target - consumed, Decimal(0)) if target is not None else None,
            "has_logs": bool(logs),
            "logs": [
                WaterOut.model_validate(row).model_dump(mode="json")
                for row in sorted(logs, key=lambda row: (row.consumed_at, row.id))
            ],
        }

    def sleep_summary(self, user_id, start, end):
        timezone = self.repository.timezone(user_id)
        first, last, begin, finish = date_range(start, end, timezone)
        rows = self.repository.range_records(
            SleepSession, user_id, SleepSession.ended_at, begin, finish
        )
        by_day = grouped(rows, lambda row: row.ended_at.astimezone(ZoneInfo(timezone)).date())
        return {
            "start_date": first,
            "end_date": last,
            "timezone": timezone,
            "assignment": "wake_up_date",
            "daily": [
                {
                    "date": first + timedelta(days=index),
                    "duration_seconds": sum(
                        (row.ended_at - row.started_at).total_seconds()
                        for row in by_day[first + timedelta(days=index)]
                    )
                    if by_day[first + timedelta(days=index)]
                    else None,
                }
                for index in range((last - first).days + 1)
            ],
            "sessions": [
                SleepOut.model_validate(row).model_dump(mode="json")
                for row in sorted(rows, key=lambda row: (row.ended_at, row.id))
            ],
        }

    def activity_summary(self, user_id, start, end):
        timezone = self.repository.timezone(user_id)
        first, last, _, _ = date_range(start, end, timezone)
        rows = self.repository.activities(user_id, first, last)
        return {
            "start_date": first,
            "end_date": last,
            "timezone": timezone,
            "observed_days": len(rows),
            "total_steps": sum(row.steps for row in rows) if rows else None,
            "daily": [ActivityOut.model_validate(row).model_dump(mode="json") for row in rows],
        }
