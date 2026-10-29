import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { createApiClient } from "../../lib/api-client";
import { StartWorkout } from "./start-workout";
import { SetEditor } from "./set-editor";
import { WorkoutSessionScreen } from "./session";
import { ExerciseFormScreen } from "./exercises";
import { PlanBuilderScreen } from "./plan-builder";
import { WorkoutProgressScreen } from "./history";
import type { Summary, Workout, WorkoutSet } from "./data";

let mockPreventionEnabled = false;
let mockPreventRemoval: ((event: { repeat: () => void }) => void) | undefined;
const mockDisablePrevention = jest.fn();
jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn() }, useLocalSearchParams: () => ({ sessionId: "session-1" }), usePreventRemove: (enabled: boolean, callback: (event: { repeat: () => void }) => void) => { mockPreventionEnabled = enabled; mockPreventRemoval = callback; return mockDisablePrevention; } }));
jest.mock("../../providers/api", () => ({ useApi: () => mockApi }));
jest.mock("../../providers/auth", () => ({ useAuth: () => ({ userId: "owner" }) }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-000000000001" }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: require("react-native").View }));
jest.mock("expo-image", () => ({ Image: require("react-native").View }));
jest.mock("@expo/ui/community/datetime-picker", () => ({ DateTimePicker: () => null }));
jest.mock("@expo/ui", () => {
  const { View, Pressable, Text } = require("react-native");
  const Picker = Object.assign(({ children }: any) => <View>{children}</View>, { Item: ({ label }: any) => <Text>{label}</Text> });
  return { Host: View, Button: ({ label, onPress, disabled }: any) => <Pressable accessibilityRole="button" accessibilityState={{ disabled }} onPress={disabled ? undefined : onPress}><Text>{label}</Text></Pressable>, Picker, BottomSheet: ({ children, isPresented }: any) => isPresented ? <View>{children}</View> : null };
});

const set: WorkoutSet = { id: "set-1", exercise_id: "exercise-1", exercise_name_snapshot: "Recorded exercise", set_number: 1, reps: 8, weight_kg: "20.000", kind: "working", is_completed: true, is_skipped: false, duration_seconds: null, rest_seconds: 90, notes: null };
const baseSession: Workout = { id: "session-1", workout_plan_day_id: null, started_at: "2026-10-28T12:00:00Z", completed_at: null, status: "in_progress", notes: null, plan_snapshot: null, sets: [set] };
const exercise = { id: "exercise-1", name: "Recorded exercise", muscle_group: "back", equipment: "cable", category: "strength", instructions: null, description: null, secondary_muscles: [], movement_type: null, difficulty: null, media_reference: null, created_by_user_id: "owner", is_archived: false };
const reply = (data: unknown, status = 200) => ({ status, ok: status < 400, headers: new Headers(), json: async () => data }) as Response;
let mockTransport: jest.Mock;
let mockApi: ReturnType<typeof createApiClient>;
beforeEach(() => { jest.clearAllMocks(); mockTransport = jest.fn(); mockApi = createApiClient("https://example.test/api/v1", async () => "synthetic-test-token", mockTransport); });

test("start conflict opens the actual saved active session", async () => {
  mockTransport.mockImplementation(async (url, options) => options.method === "POST" ? reply({ error: { code: "ACTIVE_WORKOUT_EXISTS" } }, 409) : reply({ ...baseSession, id: "actual-active" }));
  await render(<StartWorkout />);
  await fireEvent.press(screen.getByText("Start an unplanned workout"));
  await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: "/workouts/sessions/[sessionId]", params: { sessionId: "actual-active" } }));
  expect(mockTransport.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
});

test("uncertain workout start explicitly replays the exact original body and UUID", async () => {
  mockTransport.mockRejectedValueOnce(new TypeError("Synthetic lost response")).mockResolvedValueOnce(reply(baseSession, 201));
  await render(<StartWorkout />);
  await fireEvent.press(screen.getByText("Start an unplanned workout"));
  await fireEvent.press(await screen.findByText("Retry the same request"));
  await waitFor(() => expect(mockTransport).toHaveBeenCalledTimes(2));
  expect(mockTransport.mock.calls[1][1].body).toBe(mockTransport.mock.calls[0][1].body);
  expect(mockTransport.mock.calls[1][1].headers["Idempotency-Key"]).toBe(mockTransport.mock.calls[0][1].headers["Idempotency-Key"]);
});

test("custom exercise creation sends the required category and real form values", async () => {
  mockTransport.mockResolvedValue(reply(exercise, 201));
  await render(<ExerciseFormScreen />);
  await fireEvent.changeText(screen.getByLabelText("Exercise name"), "Recorded exercise");
  await fireEvent.changeText(screen.getByLabelText("Primary muscle group"), "back");
  await fireEvent.changeText(screen.getByLabelText("Equipment"), "cable");
  await fireEvent.press(screen.getByText("Save exercise"));
  await waitFor(() => expect(router.replace).toHaveBeenCalled());
  const init = mockTransport.mock.calls.find(([url]) => url.endsWith("/exercises/custom"))![1];
  expect(JSON.parse(init.body)).toMatchObject({ name: "Recorded exercise", muscle_group: "back", equipment: "cable", category: "strength", media_reference: null });
  expect(init.headers["Idempotency-Key"]).toBeTruthy();
});

test("set edits use the correct parent route and omit immutable exercise identity", async () => {
  mockTransport.mockResolvedValue(reply({ ...set, reps: 10 }));
  const saved = jest.fn();
  await render(<SetEditor session={baseSession} exerciseId="exercise-1" exerciseName="Recorded exercise" row={set} onSaved={saved} onClose={jest.fn()} />);
  await fireEvent.changeText(screen.getByLabelText("Repetitions"), "10");
  await fireEvent.press(screen.getByText("Save set"));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(mockTransport.mock.calls[0][0]).toContain("/workout-sessions/session-1/sets/set-1");
  const init = mockTransport.mock.calls[0][1];
  expect(init.method).toBe("PATCH"); expect(JSON.parse(init.body).reps).toBe(10); expect(JSON.parse(init.body)).not.toHaveProperty("exercise_id");
  expect(init.headers).not.toHaveProperty("Idempotency-Key");
});

test("an uncertain set create positively reconciles without a second POST", async () => {
  const observed: WorkoutSet = { ...set, set_number: 2, is_completed: false, reps: 0, weight_kg: "0", rest_seconds: null };
  mockTransport.mockImplementation(async (_url, options) => { if (options.method === "POST") throw new TypeError("Synthetic lost response"); return reply({ ...baseSession, sets: [set, observed] }); });
  const saved = jest.fn();
  await render(<SetEditor session={baseSession} exerciseId="exercise-1" exerciseName="Recorded exercise" onSaved={saved} onClose={jest.fn()} />);
  await fireEvent.press(screen.getByText("Save set"));
  await fireEvent.press(await screen.findByText("Reload saved data to reconcile"));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(mockTransport.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
});

function sessionTransport(current: () => Workout, write: (url: string, init: RequestInit) => Response) {
  mockTransport.mockImplementation(async (url: string, init: RequestInit) => {
    if (init.method !== "GET") return write(url, init);
    if (url.endsWith("/profile")) return reply({ timezone: "Asia/Kolkata" });
    if (url.includes("/exercises/")) return reply(exercise);
    return reply(current());
  });
}

test("pending sets disable completion and completed history has no mutation actions", async () => {
  let current = { ...baseSession, sets: [{ ...set, is_completed: false }] };
  sessionTransport(() => current, () => reply({}));
  await render(<WorkoutSessionScreen />);
  expect((await screen.findByRole("button", { name: "Complete workout" })).props.accessibilityState.disabled).toBe(true);
  expect(screen.getByText("Complete or skip every pending set before finishing.")).toBeTruthy();
  await screen.unmount();
  current = { ...baseSession, status: "completed", completed_at: "2026-10-28T12:10:00Z" };
  await render(<WorkoutSessionScreen />);
  await screen.findByText("Workout complete");
  expect(screen.queryByText("Complete workout")).toBeNull(); expect(screen.queryByText("Cancel workout")).toBeNull();
});

test("completion is confirmed before the actual lifecycle request and shows persisted summary", async () => {
  let current = baseSession;
  sessionTransport(() => current, (url, init) => {
    expect(url).toContain("/session-1/complete"); expect(init.method).toBe("POST");
    expect(Date.parse(JSON.parse(init.body as string).completed_at)).toBeGreaterThan(Date.parse(current.started_at));
    current = { ...current, status: "completed", completed_at: JSON.parse(init.body as string).completed_at };
    return reply(current);
  });
  await render(<WorkoutSessionScreen />);
  await fireEvent.press(await screen.findByText("Complete workout"));
  expect(mockTransport.mock.calls.filter(([, init]) => init.method !== "GET")).toHaveLength(0);
  await fireEvent.press(screen.getAllByText("Complete workout").at(-1)!);
  await screen.findByText("Workout complete");
  expect(mockTransport.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
});

test("cancelling preserves cancelled status and never calls completion", async () => {
  let current = baseSession;
  sessionTransport(() => current, (_url, init) => { expect(JSON.parse(init.body as string)).toEqual({ status: "cancelled" }); current = { ...current, status: "cancelled" }; return reply(current); });
  await render(<WorkoutSessionScreen />);
  await fireEvent.press(await screen.findByText("Cancel workout"));
  await fireEvent.press(screen.getAllByText("Cancel workout").at(-1)!);
  await screen.findByText("Workout cancelled");
  expect(mockTransport.mock.calls.some(([url]) => url.endsWith("/complete"))).toBe(false);
});

test("dirty workout plan intercepts Back until discard is explicitly confirmed", async () => {
  const repeat = jest.fn();
  await render(<PlanBuilderScreen />);
  await fireEvent.changeText(await screen.findByLabelText("Plan name"), "My unsaved week");
  expect(mockPreventionEnabled).toBe(true);
  await act(async () => mockPreventRemoval?.({ repeat }));
  expect(screen.getByText("Discard workout draft?")).toBeTruthy();
  await fireEvent.press(screen.getByText("Cancel"));
  expect(repeat).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Plan name").props.value).toBe("My unsaved week");
  await act(async () => mockPreventRemoval?.({ repeat }));
  await fireEvent.press(screen.getByText("Discard changes"));
  expect(repeat).toHaveBeenCalledTimes(1);
  expect(mockDisablePrevention).toHaveBeenCalled();
});

test("custom exercise keeps an uncertain create and its retry identity on Back", async () => {
  const repeat = jest.fn();
  mockTransport.mockRejectedValue(new TypeError("Synthetic connection lost"));
  await render(<ExerciseFormScreen />);
  await fireEvent.changeText(screen.getByLabelText("Exercise name"), "Retained movement");
  await fireEvent.changeText(screen.getByLabelText("Primary muscle group"), "back");
  await fireEvent.changeText(screen.getByLabelText("Equipment"), "cable");
  await fireEvent.press(screen.getByText("Save exercise"));
  await screen.findByText("Retry the same request");
  expect(mockPreventionEnabled).toBe(true);
  await act(async () => mockPreventRemoval?.({ repeat }));
  await fireEvent.press(screen.getByText("Keep editing"));
  expect(repeat).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Exercise name").props.value).toBe("Retained movement");
  expect(mockTransport.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
});

test("closing a dirty inline set editor requires explicit discard", async () => {
  const close = jest.fn();
  await render(<SetEditor session={baseSession} exerciseId="exercise-1" exerciseName="Recorded exercise" row={set} onSaved={jest.fn()} onClose={close} />);
  await fireEvent.changeText(screen.getByLabelText("Repetitions"), "12");
  await fireEvent.press(screen.getByText("Close set editor"));
  expect(close).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText("Cancel"));
  expect(screen.getByLabelText("Repetitions").props.value).toBe("12");
  await fireEvent.press(screen.getByText("Close set editor"));
  await fireEvent.press(screen.getByText("Discard changes"));
  expect(close).toHaveBeenCalledTimes(1);
});

test("session notes stop guarding after a confirmed save, then guard new edits", async () => {
  let current = baseSession;
  sessionTransport(() => current, (_url, init) => { current = { ...current, notes: JSON.parse(init.body as string).notes }; return reply(current); });
  await render(<WorkoutSessionScreen />);
  await fireEvent.changeText(await screen.findByLabelText("Workout notes"), "First saved note");
  expect(mockPreventionEnabled).toBe(true);
  await fireEvent.press(screen.getByText("Save workout notes"));
  await waitFor(() => expect(mockPreventionEnabled).toBe(false));
  await fireEvent.changeText(screen.getByLabelText("Workout notes"), "Another unsaved note");
  expect(mockPreventionEnabled).toBe(true);
});

test("large workout analytics paginate sessions and personal records with bounded name reads", async () => {
  const data: Summary = {
    start_date: "2026-10-01", end_date: "2026-10-29", timezone: "UTC", total_workouts: 45,
    workouts_this_week: 4, workouts_this_month: 45, total_duration_seconds: 2700, total_volume_kg: "900", active_days: 20, consistency_ratio: "0.5", daily: [],
    history: Array.from({ length: 45 }, (_, index) => ({ id: `recorded-${index}`, date: "2026-10-28", started_at: "2026-10-28T12:00:00Z", duration_seconds: 60, volume_kg: "20", sets: Array.from({ length: 15 }, (_, position) => ({ ...set, id: `set-${position}`, set_number: position + 1 })) })),
    personal_records: Object.fromEntries(Array.from({ length: 45 }, (_, index) => [`exercise-${index}`, { heaviest_weight_kg: "20", highest_reps: 8, highest_session_volume_kg: "160" }])),
  };
  mockTransport.mockImplementation(async (url: string) => reply(url.includes("/exercises/") ? { ...exercise, id: decodeURIComponent(url.split("/").at(-1)!) } : data));
  await render(<WorkoutProgressScreen />);
  await screen.findByText("recorded sessions: 1–20 of 45");
  expect(screen.getAllByText("Open recorded session")).toHaveLength(20);
  expect(screen.getAllByText("View exercise history")).toHaveLength(20);
  expect(screen.getAllByText(/Showing the first 10 of 15 sets/)).toHaveLength(20);
  await waitFor(() => expect(mockTransport.mock.calls.filter(([url]) => url.includes("/exercises/"))).toHaveLength(20));
  await fireEvent.press(screen.getByText("Next recorded sessions page"));
  await screen.findByText("recorded sessions: 21–40 of 45");
  expect(screen.getAllByText("Open recorded session")).toHaveLength(20);
  await fireEvent.press(screen.getByText("Next recorded sessions page"));
  await screen.findByText("recorded sessions: 41–45 of 45");
  expect(screen.getAllByText("Open recorded session")).toHaveLength(5);
  expect(screen.getByRole("button", { name: "Next recorded sessions page" }).props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByText("Next personal records page"));
  await screen.findByText("personal records: 21–40 of 45");
  await waitFor(() => expect(mockTransport.mock.calls.filter(([url]) => url.includes("/exercises/"))).toHaveLength(40));
});
