import { createApiClient } from "../../lib/api-client";
import { activeWorkout, completionTimestamp, dateRange, elapsedSeconds, pendingSets, sameSet, setStatus, snapshotDay, titleOf, workout, workoutCheck, type SetInput, type Workout, type WorkoutSet } from "./data";
import { moveExercise, planBody, planDraft } from "./plan-draft";

const set: WorkoutSet = { id: "set-1", exercise_id: "exercise-1", exercise_name_snapshot: "Recorded exercise", set_number: 1, reps: 8, weight_kg: "20.000", kind: "working", is_completed: true, is_skipped: false, duration_seconds: null, rest_seconds: 90, notes: null };
const session: Workout = { id: "session-1", workout_plan_day_id: null, started_at: "2026-10-28T12:00:00Z", completed_at: null, status: "in_progress", notes: null, plan_snapshot: null, sets: [set] };
const response = (data: unknown) => ({ ok: true, status: 200, headers: new Headers(), json: async () => data }) as Response;

test("elapsed time uses persisted start and completion, and cancelled duration stays unknown", () => {
  expect(elapsedSeconds(session, Date.parse("2026-10-28T12:05:00Z"))).toBe(300);
  expect(elapsedSeconds({ ...session, status: "completed", completed_at: "2026-10-28T12:10:00Z" }, Date.now())).toBe(600);
  expect(elapsedSeconds({ ...session, status: "cancelled" })).toBeNull();
});
test("pending and skipped sets cannot silently become completed", () => {
  const pending = { ...set, is_completed: false };
  const row = { ...session, sets: [pending, { ...pending, id: "skipped", is_skipped: true }] };
  expect(pendingSets(row)).toBe(1);
  expect(setStatus(row.sets[1])).toBe("Skipped");
  expect(() => completionTimestamp(row, Date.parse("2026-10-28T13:00:00Z"))).toThrow("Complete or skip");
});
test("completion requires an active session and a strictly later timestamp", () => {
  expect(() => completionTimestamp({ ...session, status: "completed" })).toThrow("already finished");
  expect(() => completionTimestamp(session, Date.parse(session.started_at))).toThrow("after");
  expect(completionTimestamp(session, Date.parse("2026-10-28T12:01:00Z"))).toBe("2026-10-28T12:01:00.000Z");
});
test("duration-only sessions without sets can complete", () => {
  expect(completionTimestamp({ ...session, sets: [] }, Date.parse("2026-10-28T12:01:00Z"))).toBeTruthy();
});
test("set reconciliation compares every sent field, including completion and notes", () => {
  const input: SetInput = { exercise_id: "exercise-1", set_number: 1, reps: 8, weight_kg: "20", kind: "working", is_completed: true, is_skipped: false, rest_seconds: 90 };
  expect(sameSet(set, input)).toBe(true);
  expect(sameSet({ ...set, notes: "Changed" }, input)).toBe(false);
  expect(sameSet({ ...set, is_skipped: true, is_completed: false }, input)).toBe(false);
  expect(sameSet({ ...set, reps: 9 }, input)).toBe(false);
});
test("session validator accepts terminal idempotent replay and rejects malformed sets", () => {
  expect(workoutCheck(session)).toBe(true);
  expect(workoutCheck({ ...session, status: "completed", completed_at: "2026-10-28T12:01:00Z" })).toBe(true);
  expect(workoutCheck({ ...session, sets: [{ ...set, weight_kg: null }] })).toBe(false);
  expect(workoutCheck({ ...session, started_at: "not-an-instant" })).toBe(false);
});
test("active restoration and reconciliation bypass a previously cached read", async () => {
  let calls = 0;
  const api = createApiClient("https://example.test/api/v1", async () => "test-token", async () => { calls += 1; return response(calls < 2 ? session : { ...session, status: "completed", completed_at: "2026-10-28T12:10:00Z" }); });
  expect((await workout(api, session.id)).status).toBe("in_progress");
  expect((await workout(api, session.id)).status).toBe("completed");
  expect((await activeWorkout(api))?.status).toBe("completed");
  expect(calls).toBe(3);
});
test("plan payload contains real seven-day scheduling and ordered nested exercises", () => {
  const draft = planDraft();
  draft.name = "My training week";
  draft.days[0] = { enabled: true, isRest: false, name: "Pull", exercises: [{ key: "first", exerciseId: "exercise-1", name: "Movement", sets: "3", reps: "8", weight: "12.125", rest: "90", notes: "controlled" }, { key: "second", exerciseId: "exercise-2", name: "Movement 2", sets: "2", reps: "10", weight: "", rest: "", notes: "" }] };
  draft.days[6] = { enabled: true, isRest: true, name: "Rest", exercises: [] };
  draft.days[0] = moveExercise(draft.days[0], 1, -1);
  const body = planBody(draft);
  expect(body.days.map(day => day.day_of_week)).toEqual([0, 6]);
  expect(body.days[0].exercises.map(item => [item.exercise_id, item.order_index])).toEqual([["exercise-2", 0], ["exercise-1", 1]]);
  expect(body.days[0].exercises[1]).toMatchObject({ target_sets: 3, target_reps: 8, target_weight_kg: "12.125", rest_seconds: 90 });
  expect(body.days[1]).toMatchObject({ is_rest: true, exercises: [] });
});
test("rest days reject workouts instead of silently dropping planned exercises", () => {
  const draft = planDraft(); draft.name = "Week";
  draft.days[0] = { enabled: true, isRest: true, name: "Rest", exercises: [{ key: "draft", exerciseId: "exercise-1", name: "Movement", sets: "3", reps: "8", weight: "", rest: "", notes: "" }] };
  expect(() => planBody(draft)).toThrow("Remove exercises");
});
test("history preserves start-time plan title and safely handles an invalid optional snapshot", () => {
  const day = { id: "day", day_of_week: 0, name: "Original pull", is_rest: false, exercises: [] };
  const row = { ...session, plan_snapshot: { plan_name: "Original week", day } };
  expect(titleOf(row)).toBe("Original week · Original pull");
  expect(snapshotDay(row)).toEqual(day);
  expect(snapshotDay({ ...row, plan_snapshot: { day: { ...day, exercises: "bad" } } })).toBeNull();
});
test.each([["2026-02-30", "2026-03-01"], ["2026-03-01", "2026-02-28"], ["2025-01-01", "2026-01-02"]])("date filters reject invalid, reverse or overlong ranges %s", (start, end) => {
  expect(() => dateRange(start, end)).toThrow();
});
test("date-only filtering retains literal profile-zone calendar dates", () => {
  expect(dateRange("2026-10-01", "2026-10-29")).toEqual({ start_date: "2026-10-01", end_date: "2026-10-29" });
});
