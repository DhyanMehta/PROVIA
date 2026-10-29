import { activityBody, activityData, activitySummaryData, calendarDate, elapsedLabel, goalConfirmation, onboardingContextData, rangeDates, sleepBody, sleepData, sleepSummaryData, waterBody, weightBody, weightPreviewData } from "./data";
import type { Schema } from "../../lib/contracts";
import { dateOnly } from "../../lib/form-values";

const id = "00000000-0000-4000-8000-000000000001";
const sleep = {
  id, source: "manual", external_id: null, notes: null, stages: null,
  started_at: "2026-10-28T22:00:00+05:30", ended_at: "2026-10-29T06:00:00+05:30", duration_seconds: 28800,
};

test("dates remain profile-zone calendar dates and ranges reject rollover/oversize", () => {
  expect(dateOnly("Asia/Kolkata", new Date("2026-10-28T20:00:00Z"))).toBe("2026-10-29");
  expect(dateOnly("America/Los_Angeles", new Date("2026-10-29T03:00:00Z"))).toBe("2026-10-28");
  expect(calendarDate("2026-02-30")).toBe(false);
  expect(calendarDate("2024-02-29")).toBe(true);
  expect(() => rangeDates("2026-10-29", "2026-10-28")).toThrow();
  expect(() => rangeDates("2025-01-01", "2026-10-29")).toThrow();
  expect(rangeDates("2026-01-01", "2026-12-31")).toEqual({ start_date: "2026-01-01", end_date: "2026-12-31" });
});

test("weight uses decimal-safe pounds conversion and explicit source without user identity", () => {
  expect(weightBody("154.324", "lb", "2026-01-01T08:00:00+05:30")).toEqual({ weight_kg: "70.000", source: "manual", recorded_at: "2026-01-01T08:00:00+05:30" });
  expect(() => weightBody("0", "kg", "2026-01-01T08:00:00Z")).toThrow();
  expect(() => weightBody("70.0001", "kg", "2026-01-01T08:00:00Z")).toThrow();
  expect(() => weightBody("70", "kg", "2999-01-01T08:00:00Z")).toThrow("future");
  expect(() => weightBody("70", "kg", "2026-01-01T08:00:00")).toThrow();
});

test("water keeps the exact decimal input and offset, never invents a target", () => {
  expect(waterBody("250.125", "2026-10-28T23:50:00-07:00")).toEqual({ amount_ml: "250.125", consumed_at: "2026-10-28T23:50:00-07:00" });
  expect(() => waterBody("10000.001", "2026-01-01T08:00:00Z")).toThrow();
  expect(() => waterBody("0", "2026-01-01T08:00:00Z")).toThrow();
});

test("activity is a complete daily replacement; blank optional fields stay unknown", () => {
  expect(activityBody("2026-10-29", "0", "", "", "")).toEqual({ activity_date: "2026-10-29", steps: 0, distance_m: null, active_minutes: null, activity_calories: null, source: "manual", synced_at: null });
  expect(activityBody("2026-10-29", "5400", "0", "0", "0")).toMatchObject({ distance_m: "0", active_minutes: 0, activity_calories: "0" });
  expect(() => activityBody("2026-10-29", "", "", "", "")).toThrow();
  expect(() => activityBody("2026-10-29", "200001", "", "", "")).toThrow();
  expect(() => activityBody("2026-10-29", "1.5", "", "", "")).toThrow();
});

test("sleep supports overnight and DST elapsed intervals without inferred stages", () => {
  const body = sleepBody("2026-11-01T00:30:00-04:00", "2026-11-01T08:30:00-05:00", "  rested  ");
  expect(Date.parse(body.ended_at) - Date.parse(body.started_at)).toBe(9 * 3600000);
  expect(body).toMatchObject({ notes: "rested", source: "manual" });
  expect(body).not.toHaveProperty("stages");
  expect(() => sleepBody("2026-10-29T08:00:00Z", "2026-10-29T08:00:00Z", "")).toThrow();
  expect(() => sleepBody("2026-10-28T08:00:00Z", "2026-10-29T08:00:01Z", "")).toThrow();
  expect(() => sleepBody("2026-10-28T22:00:00", "2026-10-29T08:00:00Z", "")).toThrow();
  expect(sleepBody("2026-10-28T22:00:00Z", "2026-10-29T06:00:00Z", "").notes).toBeNull();
});

test("sleep runtime validation rejects out-of-bounds, overlapping stages and mismatched duration", () => {
  expect(sleepData(sleep)).toBe(true);
  expect(sleepData({ ...sleep, duration_seconds: 999 })).toBe(false);
  expect(sleepData({ ...sleep, stages: [{ stage: "deep", started_at: "2026-10-28T23:00:00+05:30", ended_at: "2026-10-29T00:00:00+05:30" }] })).toBe(true);
  expect(sleepData({ ...sleep, stages: [{ stage: "deep", started_at: "2026-10-28T21:00:00+05:30", ended_at: "2026-10-29T00:00:00+05:30" }] })).toBe(false);
  expect(sleepData({ ...sleep, stages: [{ stage: "deep", started_at: "2026-10-28T23:00:00+05:30", ended_at: "2026-10-29T01:00:00+05:30" }, { stage: "rem", started_at: "2026-10-29T00:30:00+05:30", ended_at: "2026-10-29T02:00:00+05:30" }] })).toBe(false);
});

test("summary validators preserve missing days, known zero and server timezone", () => {
  const activity = { id, activity_date: "2026-10-29", steps: 0, distance_m: null, active_minutes: null, activity_calories: null, source: "manual", synced_at: null };
  expect(activityData(activity)).toBe(true);
  expect(activityData({ ...activity, steps: null })).toBe(false);
  expect(activitySummaryData({ start_date: "2026-10-28", end_date: "2026-10-29", timezone: "Asia/Kolkata", observed_days: 1, total_steps: 0, daily: [activity] })).toBe(true);
  expect(sleepSummaryData({ start_date: "2026-10-28", end_date: "2026-10-29", timezone: "Asia/Kolkata", assignment: "wake_date", sessions: [sleep], daily: [{ date: "2026-10-28", duration_seconds: null }, { date: "2026-10-29", duration_seconds: 28800 }] })).toBe(true);
  expect(elapsedLabel(null)).toBe("Not recorded");
  expect(elapsedLabel(0)).toBe("0 h 0 min");
});

test("goal confirmation echoes both reviewed identities and keeps calories server-calculated", () => {
  const preview = { base_goal_id: id, weight_log_id: id, current_weight_kg_snapshot: "70.125", target_weight_kg: "65", maintenance_calories: "2200", daily_calorie_target: "1700", protein_target_g: "130", carbs_target_g: "180", fat_target_g: "50", fiber_target_g: "25" };
  expect(weightPreviewData(preview)).toBe(true);
  expect(goalConfirmation(preview as Schema<"WeightGoalPreview">)).toEqual({ expected_goal_id: id, expected_weight_kg: "70.125" });
});

test("invalid profile timezone fails validation before display formatting", () => {
  expect(onboardingContextData({ profile: { timezone: "Invalid/Zone", preferred_weight_unit: "kg" }, active_goal: null })).toBe(false);
});
