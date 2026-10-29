import { progressData } from "./fitness-contracts";
import type { Schema } from "./contracts";
/** Validate rendered analytics fields, including PostgreSQL NUMERIC exponent strings. */
export function progressCheck(value: Schema<"ProgressOverview">) {
  const decimal = (item: unknown) => item === null || (typeof item === "string" && /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(item) && Number.isFinite(Number(item)));
  return progressData(value) && value.daily.every(day =>
    decimal(day.nutrition.adherence_ratio) && (["protein", "carbs", "fat", "fiber"] as const).every(key => day.nutrition[key] && [day.nutrition[key].consumed_g, day.nutrition[key].target_g, day.nutrition[key].remaining_g, day.nutrition[key].adherence_ratio].every(decimal)) &&
    day.water && typeof day.water.has_logs === "boolean" && decimal(day.water.consumed_ml) && decimal(day.water.target_ml) &&
    day.sleep && (day.sleep.duration_seconds === null || Number.isFinite(day.sleep.duration_seconds))) &&
    Array.isArray(value.workouts.daily) && value.workouts.daily.every(day => typeof day.date === "string" && Number.isInteger(day.count)) &&
    Array.isArray(value.workouts.history) && value.workouts.history.every(row => typeof row.date === "string" && (row.duration_seconds === null || Number.isFinite(row.duration_seconds)));
}
