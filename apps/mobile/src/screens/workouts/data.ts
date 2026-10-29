import type { ApiClient } from "../../lib/api-client";
import type { Schema } from "../../lib/contracts";

export type Exercise = Schema<"ExerciseOut">;
export type Plan = Schema<"PlanOut">;
export type Workout = Schema<"app__modules__workouts__schemas__SessionOut">;
export type WorkoutSet = Schema<"SetOut">;
export type Summary = Schema<"WorkoutSummary">;
export type SetInput = Schema<"SetCreate">;
export type DayInput = Schema<"DayInput">;
export type PlannedInput = Schema<"PlannedInput">;
export const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const categories = ["strength", "cardio", "mobility", "flexibility", "bodyweight"] as const;

type Check = (v: unknown) => boolean;
export const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text: Check = v => typeof v === "string";
const id: Check = v => typeof v === "string" && v.length > 0;
const bool: Check = v => typeof v === "boolean";
const count: Check = v => typeof v === "number" && Number.isInteger(v) && v >= 0;
const decimal: Check = v => typeof v === "string" && /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(v) && Number.isFinite(Number(v));
const timestamp: Check = v => typeof v === "string" && /(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));
const nullable = (f: Check): Check => v => v === null || f(v);
const list = (f: Check): Check => v => Array.isArray(v) && v.every(f);
const shape = (fields: Record<string, Check>): Check => v => object(v) && Object.entries(fields).every(([k, f]) => f(v[k]));
export const exerciseCheck = shape({ id, name: text, muscle_group: text, equipment: text, category: nullable(text), instructions: nullable(text), description: nullable(text), secondary_muscles: list(text), movement_type: nullable(text), difficulty: nullable(text), media_reference: nullable(text), created_by_user_id: nullable(id), is_archived: bool });
const plannedCheck = shape({ id, exercise_id: id, order_index: count, target_sets: count, target_reps: count, target_weight_kg: nullable(decimal), rest_seconds: nullable(count), notes: nullable(text) });
const dayCheck = shape({ id, day_of_week: v => count(v) && Number(v) < 7, name: text, is_rest: bool, exercises: list(plannedCheck) });
export const planCheck = shape({ id, name: text, description: nullable(text), goal: nullable(text), is_active: bool, days: list(shape({ id, day_of_week: v => count(v) && Number(v) < 7, name: text, is_rest: bool, exercises: list(plannedCheck) })) });
export const setCheck = shape({ id, exercise_id: id, exercise_name_snapshot: nullable(text), set_number: count, reps: count, weight_kg: decimal, kind: v => v === "working" || v === "warmup", is_completed: bool, is_skipped: bool, duration_seconds: nullable(count), rest_seconds: nullable(count), notes: nullable(text) });
export const workoutCheck = shape({ id, workout_plan_day_id: nullable(id), started_at: timestamp, completed_at: nullable(timestamp), status: v => ["in_progress", "completed", "cancelled"].includes(String(v)), notes: nullable(text), plan_snapshot: nullable(object), sets: list(setCheck) });
const pageCheck = (check: Check): Check => shape({ items: list(check), limit: count, offset: count });
const finite: Check = v => typeof v === "number" && Number.isFinite(v) && v >= 0;
export const summaryCheck = shape({ start_date: text, end_date: text, timezone: text, total_workouts: count, workouts_this_week: count, workouts_this_month: count, total_duration_seconds: nullable(finite), total_volume_kg: decimal, active_days: count, consistency_ratio: decimal, daily: list(shape({ date: text, count, volume_kg: decimal })), history: list(shape({ id, date: text, started_at: timestamp, duration_seconds: nullable(finite), volume_kg: decimal, sets: nullable(list(setCheck)) })), personal_records: v => object(v) && Object.values(v).every(shape({ heaviest_weight_kg: nullable(decimal), highest_reps: nullable(count), highest_session_volume_kg: decimal })) });

export const exercises = (api: ApiClient, query: { q?: string; category?: typeof categories[number]; muscle_group?: string; equipment?: string; offset?: number }, signal?: AbortSignal) => api.request("get", "/api/v1/exercises", { query: { ...query, limit: 20 }, signal, validate: pageCheck(exerciseCheck) });
export const exercise = (api: ApiClient, exerciseId: string, signal?: AbortSignal, fresh = false) => api.request("get", "/api/v1/exercises/{exercise_id}", { params: { exercise_id: exerciseId }, signal, ...(fresh ? { cacheMs: 0 } : {}), validate: exerciseCheck });
export const plans = (api: ApiClient, offset = 0, signal?: AbortSignal) => api.request("get", "/api/v1/workout-plans", { query: { limit: 20, offset }, signal, validate: pageCheck(planCheck) });
export const plan = (api: ApiClient, planId: string, signal?: AbortSignal, fresh = false) => api.request("get", "/api/v1/workout-plans/{plan_id}", { params: { plan_id: planId }, signal, ...(fresh ? { cacheMs: 0 } : {}), validate: planCheck });
export const activeWorkout = (api: ApiClient, signal?: AbortSignal) => api.request("get", "/api/v1/workout-sessions/active", { signal, cacheMs: 0, validate: nullable(workoutCheck) });
export const workout = (api: ApiClient, sessionId: string, signal?: AbortSignal) => api.request("get", "/api/v1/workout-sessions/{session_id}", { params: { session_id: sessionId }, signal, cacheMs: 0, validate: workoutCheck });
export const sessions = (api: ApiClient, query: { start_date?: string; end_date?: string; status?: "in_progress" | "completed" | "cancelled"; offset?: number }, signal?: AbortSignal) => api.request("get", "/api/v1/workout-sessions", { query: { ...query, limit: 20 }, signal, validate: pageCheck(workoutCheck) });
export const summary = (api: ApiClient, query: { start_date?: string; end_date?: string }, signal?: AbortSignal, exerciseId?: string) => exerciseId
  ? api.request("get", "/api/v1/workouts/exercises/{exercise_id}/history", { query, params: { exercise_id: exerciseId }, signal, validate: summaryCheck })
  : api.request("get", "/api/v1/workouts/progress", { query, signal, validate: summaryCheck });

/** Find the actual active plan, including one older than the first page. */
export async function activePlan(api: ApiClient, signal?: AbortSignal): Promise<Plan | null> {
  for (let offset = 0; offset < 10000; offset += 20) {
    const page = await plans(api, offset, signal);
    const found = page.items.find(row => row.is_active);
    if (found) return found;
    if (page.items.length < 20) return null;
  }
  throw new Error("Too many plans to find the active schedule safely. Open your plan list.");
}

export function integerInput(value: string, label: string, min: number, max: number): number {
  if (!/^\d+$/.test(value.trim()) || Number(value) < min || Number(value) > max) throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  return Number(value);
}
export function duration(seconds: number | null): string {
  if (seconds === null) return "Not recorded";
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}
export function titleOf(row: Workout): string {
  const snapshot = row.plan_snapshot;
  const day = snapshot && object(snapshot.day) ? snapshot.day : null;
  return snapshot && typeof snapshot.plan_name === "string" ? `${snapshot.plan_name}${day && typeof day.name === "string" ? ` · ${day.name}` : ""}` : "Unplanned workout";
}
export function snapshotDay(row: Workout): Schema<"DayOut"> | null {
  const value = row.plan_snapshot?.day;
  return dayCheck(value) ? value as Schema<"DayOut"> : null;
}
export function setStatus(row: WorkoutSet): string {
  return row.is_skipped ? "Skipped" : row.is_completed ? "Completed" : "Pending";
}
export function sameSet(row: WorkoutSet, input: SetInput): boolean {
  return row.exercise_id === input.exercise_id && row.set_number === input.set_number && row.reps === input.reps && Number(row.weight_kg) === Number(input.weight_kg) && row.kind === input.kind && row.is_completed === input.is_completed && row.is_skipped === input.is_skipped && row.duration_seconds === (input.duration_seconds ?? null) && row.rest_seconds === (input.rest_seconds ?? null) && row.notes === (input.notes ?? null);
}
export function dateRange(start: string, end: string): { start_date: string; end_date: string } {
  const valid = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + "T00:00:00Z")) && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
  const span = (Date.parse(end) - Date.parse(start)) / 86400000;
  if (!valid(start) || !valid(end) || span < 0 || span > 365) throw new Error("Choose an ordered date range of 1 to 366 days (YYYY-MM-DD).");
  return { start_date: start, end_date: end };
}

export function elapsedSeconds(row: Workout, now = Date.now()): number | null {
  const end = row.completed_at ? Date.parse(row.completed_at) : row.status === "in_progress" ? now : null;
  return end === null ? null : Math.max(0, Math.floor((end - Date.parse(row.started_at)) / 1000));
}
export function pendingSets(row: Workout): number { return row.sets.filter(item => !item.is_completed && !item.is_skipped).length; }
export function completionTimestamp(row: Workout, now = Date.now()): string {
  if (row.status !== "in_progress") throw new Error("This workout is already finished. Reload its saved summary.");
  if (pendingSets(row)) throw new Error("Complete or skip every pending set before finishing this workout.");
  if (now <= Date.parse(row.started_at)) throw new Error("Completion must be after the workout start. Check your device clock.");
  return new Date(now).toISOString();
}
