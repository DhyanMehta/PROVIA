import {
  dashboardData,
  foodSearchData,
  planPage,
  progressData,
  startedWorkout,
} from "./fitness-contracts";

function day() {
  const macro = { consumed_g: "0.000", target_g: null };
  return {
    date: "2026-10-27",
    timezone: "Asia/Kolkata",
    nutrition: {
      meals: [],
      calories: { target: null, consumed: "0", remaining: "-25.500" },
      protein: macro,
      carbs: macro,
      fat: macro,
      fiber: macro,
    },
    water: { has_logs: false, consumed_ml: "0", target_ml: null },
    activity: { steps: 0, active_minutes: null },
    sleep: { duration_seconds: null },
    workouts: { total_workouts: 0 },
    weight: null,
  };
}

test("dashboard boundaries retain zero, unknown and exact backend decimal strings", () => {
  const value = day();
  expect(dashboardData(value)).toBe(true);
  expect(value.nutrition.calories.remaining).toBe("-25.500");
  expect(
    dashboardData({
      ...value,
      weight: { weight_kg: "97.000", recorded_at: "2026-10-27T10:00:00+05:30" },
    }),
  ).toBe(true);
});

test.each([
  ["malformed present goal target", { ...day(), goal: { target_weight_kg: "private-invalid-value" } }],
  ["wrong goal decimal representation", { ...day(), goal: { target_weight_kg: 85 } }],
  ["missing structure", {}],
  ["null response", null],
  [
    "nonarray meals",
    { ...day(), nutrition: { ...day().nutrition, meals: {} } },
  ],
  ["impossible calendar date", { ...day(), date: "2026-02-31" }],
  ["missing water", { ...day(), water: null }],
  [
    "object metric",
    { ...day(), water: { ...day().water, consumed_ml: { value: 10 } } },
  ],
  [
    "nonfinite metric",
    { ...day(), water: { ...day().water, consumed_ml: "1e999" } },
  ],
  [
    "invalid timestamp",
    {
      ...day(),
      weight: { weight_kg: "97", recorded_at: "private-invalid-date" },
    },
  ],
])("rejects malformed dashboard %s", (_label, value) =>
  expect(dashboardData(value)).toBe(false),
);

test("workout creation requires an in-progress response and an aware timestamp", () => {
  const value = {
    id: "server-session",
    started_at: "2026-10-27T10:00:00Z",
    status: "in_progress",
  };
  expect(startedWorkout(value)).toBe(true);
  expect(startedWorkout({ ...value, status: "completed" })).toBe(false);
  expect(startedWorkout({ ...value, started_at: "2026-10-27" })).toBe(false);
});

test("workout list validation checks the rendered schedule fields", () => {
  const plan = {
    id: "plan",
    name: "Plan",
    is_active: true,
    days: [{ id: "day", name: "Monday", is_rest: false, day_of_week: 0 }],
  };
  expect(planPage({ items: [plan] })).toBe(true);
  expect(planPage({ items: [{ ...plan, days: null }] })).toBe(false);
  expect(
    planPage({
      items: [{ ...plan, days: [{ ...plan.days[0], day_of_week: 7 }] }],
    }),
  ).toBe(false);
});

test("progress and food catalog preserve legitimate empty and unknown states", () => {
  const progress = {
    start_date: "2026-10-21",
    end_date: "2026-10-27",
    timezone: "Asia/Kolkata",
    daily: [],
    weight_history: [],
    weight_change_kg: null,
    water_consistency: { days_met: 0, observed_days_with_target: 0 },
    workouts: { total_workouts: 0, active_days: 0 },
  };
  expect(progressData(progress)).toBe(true);
  expect(progressData({ ...progress, weight_history: null })).toBe(false);
  expect(
    foodSearchData({
      items: [
        { id: "food", name: "Food", calories_kcal: null, source: "custom" },
      ],
      provider_status: { local: "available" },
    }),
  ).toBe(true);
  expect(foodSearchData({ items: [], provider_status: null })).toBe(false);
});
