// Validate the fields rendered by foundation screens at the JSON boundary.
// Generated backend types remain the full contract; these checks do not calculate targets.
type Check = (value: unknown) => boolean;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text: Check = (value) => typeof value === "string";
const identifier: Check = (value) =>
  typeof value === "string" && value.length > 0;
const boolean: Check = (value) => typeof value === "boolean";
const count: Check = (value) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;
const decimal: Check = (value) =>
  (typeof value === "number" && Number.isFinite(value)) ||
  (typeof value === "string" &&
    /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value) &&
    Number.isFinite(Number(value)));
const date: Check = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(value + "T12:00:00Z");
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};
const timestamp: Check = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
    value,
  ) &&
  date(value.slice(0, 10)) &&
  Number.isFinite(Date.parse(value));
const nullable =
  (check: Check): Check =>
  (value) =>
    value === null || check(value);
const list =
  (check: Check): Check =>
  (value) =>
    Array.isArray(value) && value.every(check);
const shape =
  (checks: Record<string, Check>): Check =>
  (value) =>
    record(value) &&
    Object.entries(checks).every(([key, check]) => check(value[key]));
const page = (item: Check) => shape({ items: list(item) });
const metric = nullable(decimal);
const weight = shape({ recorded_at: timestamp, weight_kg: decimal });
const macro = shape({ consumed_g: metric, target_g: metric });
const nutrition = shape({
  meals: list(
    shape({
      id: identifier,
      meal_type: text,
      consumed_at: timestamp,
      totals: shape({ calories_kcal: metric }),
    }),
  ),
  calories: shape({ target: metric, consumed: metric, remaining: metric }),
  protein: macro,
  carbs: macro,
  fat: macro,
  fiber: macro,
});

export const dashboardData = shape({
  date,
  timezone: text,
  nutrition,
  water: shape({ has_logs: boolean, consumed_ml: decimal, target_ml: metric }),
  activity: nullable(shape({ steps: count, active_minutes: nullable(count) })),
  sleep: shape({
    duration_seconds: nullable(
      (value) =>
        typeof value === "number" && Number.isFinite(value) && value >= 0,
    ),
  }),
  workouts: shape({ total_workouts: count }),
  weight: nullable(weight),
});

export const planPage = page(
  shape({
    id: identifier,
    name: text,
    is_active: boolean,
    days: list(
      shape({
        id: identifier,
        name: text,
        is_rest: boolean,
        day_of_week: (value) => count(value) && (value as number) <= 6,
      }),
    ),
  }),
);
export const exercisePage = page(
  shape({ id: identifier, name: text, muscle_group: nullable(text) }),
);
export const sessionPage = page(
  shape({ id: identifier, started_at: timestamp, status: text }),
);
export const startedWorkout = shape({
  id: identifier,
  started_at: timestamp,
  status: (value) => value === "in_progress",
});
export const progressData = shape({
  start_date: date,
  end_date: date,
  timezone: text,
  daily: list(
    shape({
      date,
      nutrition: shape({
        has_logs: boolean,
        calories_consumed: metric,
        calories_target: metric,
      }),
    }),
  ),
  weight_history: list(
    shape({ id: identifier, recorded_at: timestamp, weight_kg: decimal }),
  ),
  weight_change_kg: metric,
  water_consistency: shape({
    days_met: count,
    observed_days_with_target: count,
  }),
  workouts: shape({ total_workouts: count, active_days: count }),
});
export const foodSearchData = shape({
  items: list(
    shape({ id: identifier, name: text, calories_kcal: metric, source: text }),
  ),
  provider_status: (value) => record(value) && Object.values(value).every(text),
});
export const profileSummary = shape({
  profile: nullable(
    shape({
      display_name: text,
      height_cm: decimal,
      current_weight_kg: decimal,
      timezone: text,
    }),
  ),
  active: nullable(
    shape({ target_weight_kg: metric, daily_calorie_target: metric }),
  ),
});
