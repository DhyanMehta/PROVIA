import type { ApiClient } from "./api-client";
import { ApiError } from "./api-client";
import type { Schema } from "./contracts";
import { randomUUID } from "expo-crypto";
import { profileData, goalData, goalTypes } from "./profile-values";

export function decimalInput(
  value: string,
  label: string,
  maximum: number,
  places = 3,
): string {
  if (
    !new RegExp(`^\\d+(\\.\\d{1,${places}})?$`).test(value.trim()) ||
    Number(value) <= 0 ||
    Number(value) > maximum
  )
    throw new Error(
      `Enter a valid ${label} between 0 and ${maximum}, with at most ${places} decimal places.`,
    );
  return value.trim();
}
const equalDecimal = (a: unknown, b: unknown) => Number(a) === Number(b);

async function activeGoal(api: ApiClient, signal?: AbortSignal) {
  for (let offset = 0; offset < 10000; offset += 100) {
    const page = await api.request("get", "/api/v1/goals", {
      cacheMs: 0,
      signal,
      query: { limit: 100, offset },
      validate: (page) =>
        Array.isArray(page.items) &&
        page.items.every((goal) => goal && typeof goal.status === "string"),
    });
    const active = page.items.find((goal) => goal.status === "active");
    if (active) return active;
    if (page.items.length < 100) return null;
  }
  throw new ApiError(
    "Too much goal history to scan safely. Contact support.",
    422,
    "GOAL_HISTORY_LIMIT",
  );
}

export type SetupStep = "session" | "profile" | "goals";
export async function loadSetup(
  api: ApiClient,
  signal?: AbortSignal,
  onStep?: (step: SetupStep) => void,
) {
  onStep?.("session");
  const me = await api.request("get", "/api/v1/me", {
    signal,
    validate: (me) => typeof me.id === "string" && !!me.id,
  });
  onStep?.("profile");
  const authority = await api.request("get", "/api/v1/onboarding", {
    cacheMs: 0,
    signal,
    validate: (value) => !!value && typeof value.onboarding_complete === "boolean" &&
      ["verify_email", "profile", "goal", "dashboard"].includes(value.next_step) &&
      typeof value.profile_exists === "boolean" && typeof value.active_goal_exists === "boolean" &&
      typeof value.authenticated === "boolean" && typeof value.email_verified === "boolean" &&
      value.profile_exists === (value.profile !== null) && value.active_goal_exists === (value.active_goal !== null) &&
      (value.profile === null || profileData(value.profile)) &&
      (value.active_goal === null || goalData(value.active_goal)) &&
      (value.next_step !== "dashboard" || (value.onboarding_complete && value.email_verified && value.profile_exists && value.active_goal_exists)),
  });
  onStep?.("goals");
  return { me, profile: authority.profile, active: authority.active_goal, authority };
}

export function goalMatches(
  goal: Schema<"GoalOut">,
  input: Schema<"GoalCreate">,
) {
  return (
    goal.status === "active" &&
    goal.calculation_method !== null &&
    goal.goal_type === (input.goal_type ?? "weight_loss") &&
    equalDecimal(goal.current_weight_kg_snapshot, input.current_weight_kg) &&
    equalDecimal(goal.target_weight_kg, input.target_weight_kg) &&
    equalDecimal(goal.selected_deficit_kcal, input.selected_deficit_kcal) &&
    goal.daily_steps_target === (input.daily_steps_target ?? null)
  );
}

export type PendingGoalStore = {
  read: () => Promise<string | null>;
  write: (value: string) => Promise<void>;
  clear: () => Promise<void>;
};
function goalIdentity(goal: Schema<"GoalCreate">) {
  return JSON.stringify([
    goal.goal_type,
    Number(goal.current_weight_kg),
    Number(goal.target_weight_kg),
    Number(goal.selected_deficit_kcal),
  ]);
}
function savedIdentity(goal: Schema<"GoalOut">) {
  return JSON.stringify([
    goal.goal_type,
    Number(goal.current_weight_kg_snapshot),
    Number(goal.target_weight_kg),
    Number(goal.selected_deficit_kcal),
  ]);
}
type Receipt = { version: 2; identity: string; key: string; body: Schema<"GoalCreate"> };
function requestIdentity(goal: Schema<"GoalCreate">) {
  return JSON.stringify([goalIdentity(goal), goal.daily_steps_target ?? null, goal.status]);
}
function receipt(value: string | null): Receipt | null {
  try {
    const item = JSON.parse(value ?? "null");
    const body = item?.body;
    if (item?.version !== 2 || typeof item.key !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.key) ||
      !body || typeof body !== "object" || Array.isArray(body) || !goalTypes.includes(body.goal_type) || !["active", "paused", "completed"].includes(body.status) ||
      Object.keys(body).some(key => !["goal_type", "current_weight_kg", "target_weight_kg", "selected_deficit_kcal", "daily_steps_target", "status"].includes(key)) ||
      [body.current_weight_kg, body.target_weight_kg, body.selected_deficit_kcal].some(amount => !["number", "string"].includes(typeof amount) || !/^\d+(\.\d+)?$/.test(String(amount)) || !Number.isFinite(Number(amount))) ||
      !(body.daily_steps_target == null || (Number.isInteger(body.daily_steps_target) && body.daily_steps_target >= 0 && body.daily_steps_target <= 200000)) ||
      item.identity !== goalIdentity(body)) return null;
    return item;
  } catch { return null; }
}

// A persisted marker is written before POST. A missing row after a lost response
// does not prove rollback: fail closed until a positive matching read resolves it.
export function createOnboardingSaver(
  api: ApiClient,
  pending: PendingGoalStore,
) {
  let running: Promise<Schema<"GoalOut">> | null = null;
  return (profile: Schema<"ProfilePut">, goal: Schema<"GoalCreate">) => {
    if (running) return running;
    running = (async () => {
      const saved = await activeGoal(api);
      let marker = await pending.read();
      let retained = receipt(marker);
      if (marker && saved && (retained ? goalMatches(saved, retained.body) : savedIdentity(saved) === marker)) {
        await pending.clear();
        marker = null;
        retained = null;
      }
      if (marker && (!retained || requestIdentity(retained.body) !== requestIdentity(goal)))
        throw new ApiError(
          "An earlier goal save is unresolved. Reconcile with the server before creating another goal.",
          409,
          "GOAL_SAVE_PENDING",
          null,
          true,
        );
      if (saved && goalMatches(saved, goal)) return saved;
      let existing: Schema<"ProfileOut"> | null = null;
      try {
        existing = await api.request("get", "/api/v1/profile", { cacheMs: 0, validate: profileData });
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) throw error;
      }
      if (!existing)
        await api.request("put", "/api/v1/profile", { body: profile, validate: profileData });
      const submission: Receipt = retained ?? { version: 2, identity: goalIdentity(goal), key: randomUUID(), body: JSON.parse(JSON.stringify(goal)) };
      if (!retained) await pending.write(JSON.stringify(submission));
      try {
        const created = await api.request("post", "/api/v1/goals", {
          body: submission.body,
          idempotencyKey: submission.key,
          validate: goalData,
        });
        await pending.clear();
        return created;
      } catch (error) {
        // Definite client rejection does not execute a goal mutation. Network,
        // cancellation, timeout and server errors stay pending across app restarts.
        if (
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500 &&
          error.status !== 408
        )
          await pending.clear();
        throw error;
      }
    })().finally(() => {
      running = null;
    });
    return running;
  };
}
