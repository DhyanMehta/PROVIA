import type { ApiClient } from "./api-client";
import { ApiError } from "./api-client";
import type { Schema } from "./contracts";

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
      signal,
      query: { limit: 100, offset },
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

export async function loadSetup(api: ApiClient, signal?: AbortSignal) {
  const me = await api.request("get", "/api/v1/me", { signal });
  let profile: Schema<"ProfileOut"> | null = null;
  try {
    profile = await api.request("get", "/api/v1/profile", { signal });
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }
  const active = await activeGoal(api, signal);
  return { me, profile, active };
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
    equalDecimal(goal.selected_deficit_kcal, input.selected_deficit_kcal)
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
      if (marker && saved && savedIdentity(saved) === marker) {
        await pending.clear();
        marker = null;
      }
      if (marker)
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
        existing = await api.request("get", "/api/v1/profile");
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) throw error;
      }
      if (!existing)
        await api.request("put", "/api/v1/profile", { body: profile });
      await pending.write(goalIdentity(goal));
      try {
        const created = await api.request("post", "/api/v1/goals", {
          body: goal,
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
