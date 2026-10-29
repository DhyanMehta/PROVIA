import type { Schema } from "../../lib/contracts";
import { decimalInput, lbToKg, offsetTimestamp } from "../../lib/form-values";

export type Weight = Schema<"WeightOut">;
export type Water = Schema<"WaterOut">;
export type Activity = Schema<"ActivityOut">;
export type Sleep = Schema<"SleepOut">;
export const PAGE_SIZE = 20;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown) => typeof value === "string" && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
const text = (value: unknown) => typeof value === "string";
export const decimal = (value: unknown) => typeof value === "string" && /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value) && Number.isFinite(Number(value));
const nullable = (check: (value: unknown) => boolean) => (value: unknown) => value === null || check(value);
export function calendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T12:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && Number(value.slice(0, 4)) >= 1900 && Number(value.slice(0, 4)) < 9999;
}
const timestamp = (value: unknown) => {
  if (typeof value !== "string") return false;
  try { offsetTimestamp(value); return calendarDate(value.slice(0, 10)); } catch { return false; }
};
const integer = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0;
const source = (value: unknown) => value === "manual" || value === "health_connect";
export const weightData = (value: unknown) => object(value) && id(value.id) && decimal(value.weight_kg) && Number(value.weight_kg) > 0 && Number(value.weight_kg) <= 1000 && timestamp(value.recorded_at) && source(value.source);
export const waterData = (value: unknown) => object(value) && id(value.id) && decimal(value.amount_ml) && Number(value.amount_ml) > 0 && Number(value.amount_ml) <= 10000 && timestamp(value.consumed_at);
export const activityData = (value: unknown) => object(value) && id(value.id) && calendarDate(value.activity_date) && integer(value.steps) && Number(value.steps) <= 200000 && nullable(decimal)(value.distance_m) && nullable(integer)(value.active_minutes) && nullable(decimal)(value.activity_calories) && source(value.source) && nullable(timestamp)(value.synced_at);
export function sleepData(value: unknown): boolean {
  if (!object(value) || !id(value.id) || !timestamp(value.started_at) || !timestamp(value.ended_at) || !source(value.source) || typeof value.duration_seconds !== "number" || !Number.isFinite(value.duration_seconds) || !nullable(text)(value.notes)) return false;
  const start = Date.parse(value.started_at as string), end = Date.parse(value.ended_at as string);
  if (value.duration_seconds <= 0 || value.duration_seconds > 86400 || Math.abs(value.duration_seconds - (end - start) / 1000) > .001) return false;
  if (value.stages === null) return true;
  if (!Array.isArray(value.stages) || value.stages.length > 500) return false;
  let previous = start;
  for (const stage of value.stages) {
    if (!object(stage) || !["awake", "light", "deep", "rem", "sleeping", "unknown"].includes(String(stage.stage)) || !timestamp(stage.started_at) || !timestamp(stage.ended_at)) return false;
    const stageStart = Date.parse(stage.started_at as string), stageEnd = Date.parse(stage.ended_at as string);
    if (stageStart < previous || stageStart >= stageEnd || stageEnd > end) return false;
    previous = stageEnd;
  }
  return true;
}
export const pageData = (check: (value: unknown) => boolean) => (value: unknown) => object(value) && Array.isArray(value.items) && value.items.length <= 100 && value.items.every(check) && integer(value.limit) && integer(value.offset);
export const waterDashboardData = (value: unknown) => object(value) && calendarDate(value.date) && text(value.timezone) && decimal(value.consumed_ml) && nullable(decimal)(value.target_ml) && nullable(decimal)(value.remaining_ml) && typeof value.has_logs === "boolean" && Array.isArray(value.logs) && value.logs.every(waterData);
export const targetData = (value: unknown) => object(value) && id(value.id) && calendarDate(value.effective_date) && decimal(value.target_ml);
const timeZone = (value: unknown) => { if (typeof value !== "string") return false; try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; } };
export const onboardingContextData = (value: unknown) => object(value) && (value.profile === null || (object(value.profile) && timeZone(value.profile.timezone) && ["kg", "lb"].includes(String(value.profile.preferred_weight_unit)))) && (value.active_goal === null || (object(value.active_goal) && id(value.active_goal.id) && nullable(decimal)(value.active_goal.target_weight_kg)));
export const weightPreviewData = (value: unknown) => object(value) && id(value.base_goal_id) && id(value.weight_log_id) && ["current_weight_kg_snapshot", "target_weight_kg", "maintenance_calories", "daily_calorie_target", "protein_target_g", "carbs_target_g", "fat_target_g", "fiber_target_g"].every(key => decimal(value[key]));
export const appliedGoalData = (value: unknown) => object(value) && id(value.id) && nullable(decimal)(value.daily_calorie_target);
export const activitySummaryData = (value: unknown) => object(value) && calendarDate(value.start_date) && calendarDate(value.end_date) && timeZone(value.timezone) && integer(value.observed_days) && nullable(integer)(value.total_steps) && Array.isArray(value.daily) && value.daily.every(activityData);
export const sleepSummaryData = (value: unknown) => object(value) && calendarDate(value.start_date) && calendarDate(value.end_date) && timeZone(value.timezone) && text(value.assignment) && Array.isArray(value.sessions) && value.sessions.every(sleepData) && Array.isArray(value.daily) && value.daily.length <= 366 && value.daily.every(point => object(point) && calendarDate(point.date) && (point.duration_seconds === null || (typeof point.duration_seconds === "number" && Number.isFinite(point.duration_seconds) && point.duration_seconds >= 0)));

export function rangeDates(start: string, end: string) {
  if (!calendarDate(start) || !calendarDate(end)) throw new Error("Enter valid dates as YYYY-MM-DD, between 1900 and 9998.");
  const count = (Date.parse(end + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) / 86400000 + 1;
  if (count < 1 || count > 366) throw new Error("Choose an ordered range of at most 366 calendar days.");
  return { start_date: start, end_date: end };
}
export function weightBody(value: string, unit: "kg" | "lb", recordedAt: string): Schema<"WeightCreate"> {
  const weight = unit === "lb" ? lbToKg(value) : value;
  const weight_kg = decimalInput(weight, "weight", 0, 1000);
  if (Number(weight_kg) <= 0) throw new Error("Weight must be greater than zero.");
  const recorded_at = offsetTimestamp(recordedAt);
  if (!calendarDate(recorded_at.slice(0, 10))) throw new Error("Choose a supported measurement date between 1900 and 9998.");
  if (Date.parse(recorded_at) > Date.now()) throw new Error("Weight cannot be recorded in the future.");
  return { weight_kg, recorded_at, source: "manual" };
}
export function waterBody(value: string, consumedAt: string): Schema<"WaterCreate"> {
  const amount_ml = decimalInput(value, "water amount", 0, 10000);
  if (Number(amount_ml) <= 0) throw new Error("Water amount must be greater than zero.");
  const consumed_at = offsetTimestamp(consumedAt);
  if (!calendarDate(consumed_at.slice(0, 10))) throw new Error("Choose a supported water date between 1900 and 9998.");
  return { amount_ml, consumed_at };
}
function whole(value: string, label: string, maximum: number) {
  if (!/^\d+$/.test(value.trim()) || Number(value) > maximum) throw new Error(`Enter ${label} as a whole number from 0 to ${maximum}.`);
  return Number(value);
}
export function activityBody(activityDate: string, steps: string, distance: string, minutes: string, calories: string): Schema<"ActivityPut"> {
  if (!calendarDate(activityDate)) throw new Error("Enter the activity date as YYYY-MM-DD.");
  return { activity_date: activityDate, steps: whole(steps, "steps", 200000), distance_m: distance.trim() ? decimalInput(distance, "distance", 0, 1000000) : null, active_minutes: minutes.trim() ? whole(minutes, "active minutes", 1440) : null, activity_calories: calories.trim() ? decimalInput(calories, "active calories", 0, 100000) : null, source: "manual", synced_at: null };
}
export function sleepBody(start: string, end: string, notes: string): Schema<"SleepCreate"> {
  const started_at = offsetTimestamp(start), ended_at = offsetTimestamp(end);
  if (!calendarDate(started_at.slice(0, 10)) || !calendarDate(ended_at.slice(0, 10))) throw new Error("Choose supported sleep dates between 1900 and 9998.");
  const elapsed = Date.parse(ended_at) - Date.parse(started_at);
  if (elapsed <= 0 || elapsed > 86400000) throw new Error("Sleep must end after it starts and last at most 24 elapsed hours.");
  if (notes.length > 4000) throw new Error("Sleep notes must be at most 4000 characters.");
  return { started_at, ended_at, notes: notes.trim() || null, source: "manual" };
}
export function goalConfirmation(preview: Schema<"WeightGoalPreview">): Schema<"WeightGoalConfirmation"> {
  return { expected_goal_id: preview.base_goal_id, expected_weight_kg: preview.current_weight_kg_snapshot };
}
export function elapsedLabel(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return "Not recorded";
  const minutes = Math.floor(seconds / 60);
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
