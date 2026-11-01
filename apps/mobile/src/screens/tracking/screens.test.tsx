import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ApiError } from "../../lib/api-client";
import { WeightEntryScreen, WeightGoalScreen } from "./weight";
import { WaterScreen } from "./water";
import { ActivityScreen } from "./activity";
import { SleepEntryScreen, SleepHistoryScreen } from "./sleep";
import { HealthConnectScreen } from "./health-connect";

const mockRequest = jest.fn();
let mockParams: { weight_id?: string; session_id?: string } = {};
const mockPreventRemove = jest.fn().mockReturnValue(jest.fn());
const mockApi = { request: mockRequest };
jest.mock("../../providers/api", () => ({ useApi: () => mockApi }));
jest.mock("../../providers/auth", () => ({ useAuth: () => ({ userId: "00000000-0000-4000-8000-000000000001", session: { getGeneration: () => 1, getSnapshot: () => ({ user: { id: "00000000-0000-4000-8000-000000000001" } }) } }) }));
jest.mock("../../lib/health-connect/native", () => ({ nativeHealth: { availability: jest.fn(), permissions: jest.fn(), request: jest.fn(), read: jest.fn(), manage: jest.fn() }, nativeLedger: () => ({ get: jest.fn().mockResolvedValue(null), set: jest.fn() }), receiptIdentity: jest.fn() }));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn() }, useLocalSearchParams: () => mockParams, usePreventRemove: (...args: unknown[]) => mockPreventRemove(...args) }));
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn(() => "00000000-0000-4000-8000-000000000099") }));
jest.mock("@expo/ui", () => {
  const { View, Pressable, Text } = require("react-native");
  const Picker = Object.assign(({ children }: any) => <View>{children}</View>, { Item: ({ label }: any) => <Text>{label}</Text> });
  return { Host: View, Picker, Button: ({ label, onPress, disabled }: any) => <Pressable accessibilityRole="button" accessibilityState={{ disabled }} onPress={disabled ? undefined : onPress}><Text>{label}</Text></Pressable>, BottomSheet: ({ children, isPresented }: any) => isPresented ? <View>{children}</View> : null };
});
jest.mock("@expo/ui/community/datetime-picker", () => ({ DateTimePicker: () => null }));
jest.mock("../../components/design/icon", () => ({ AppIcon: () => null, IconButton: () => null }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: require("react-native").View }));

const weightId = "00000000-0000-4000-8000-000000000001";
const goalId = "00000000-0000-4000-8000-000000000002";
const waterId = "00000000-0000-4000-8000-000000000003";
const sleepId = "00000000-0000-4000-8000-000000000004";
const profile = { timezone: "Asia/Kolkata", preferred_weight_unit: "kg" };
const context = { profile, active_goal: { id: goalId, target_weight_kg: "65" } };
const weight = { id: weightId, weight_kg: "70.125", recorded_at: "2026-01-01T08:00:00Z", source: "manual" };
const sleep = { id: sleepId, started_at: "2026-10-28T22:00:00+05:30", ended_at: "2026-10-29T06:00:00+05:30", duration_seconds: 28800, notes: "Rested", source: "manual", external_id: null, stages: null };
const preview = { base_goal_id: goalId, weight_log_id: weightId, current_weight_kg_snapshot: "70.125", target_weight_kg: "65", maintenance_calories: "2200", daily_calorie_target: "1700", protein_target_g: "130", carbs_target_g: "180", fat_target_g: "50", fiber_target_g: "25", calculation_method: "provia", calculation_version: "1" };
function page(items: unknown[] = []) { return { items, limit: 20, offset: 0 }; }

beforeEach(() => {
  mockParams = { weight_id: weightId, session_id: sleepId };
  mockPreventRemove.mockClear();
  mockRequest.mockReset();
  mockRequest.mockImplementation(async (method: string, path: string, options?: any) => {
    if (path === "/api/v1/onboarding") return context;
    if (path === "/api/v1/weight-logs/{weight_id}") return weight;
    if (path === "/api/v1/weight-logs" && method === "post") return { ...weight, ...options.body };
    if (path === "/api/v1/weight-logs/{weight_id}/goal-preview") return preview;
    if (path === "/api/v1/weight-logs/{weight_id}/apply-goal") return { id: goalId, daily_calorie_target: "1700" };
    if (path === "/api/v1/water/dashboard") return { date: "2026-10-29", timezone: "Asia/Kolkata", consumed_ml: "0", target_ml: null, remaining_ml: null, has_logs: false, logs: [] };
    if (path === "/api/v1/water-logs" && method === "post") return { id: waterId, ...options.body };
    if (path === "/api/v1/water-logs") return page();
    if (path === "/api/v1/activity/daily" && method === "get") return null;
    if (path === "/api/v1/activity/daily" && method === "put") return { id: goalId, ...options.body };
    if (path === "/api/v1/activity") return page();
    if (path === "/api/v1/activity/summary") return { observed_days: 0, total_steps: null, daily: [] };
    if (path === "/api/v1/sleep-sessions/{session_id}") return method === "delete" ? undefined : sleep;
    if (path === "/api/v1/sleep-sessions" && method === "post") return { ...sleep, ...options.body };
    if (path === "/api/v1/sleep-sessions") return page([sleep]);
    if (path === "/api/v1/sleep/summary") return { daily: [{ date: "2026-10-28", duration_seconds: null }, { date: "2026-10-29", duration_seconds: 28800 }], sessions: [sleep], assignment: "wake_date" };
    throw new Error(`Unexpected test request ${method} ${path}`);
  });
});

test("weight create sends an explicit manual timestamp and retained receipt without applying a goal", async () => {
  await render(<WeightEntryScreen create />);
  await screen.findByText("Save weight");
  await fireEvent.changeText(screen.getByLabelText("Measured weight (kg)"), "70.125");
  await fireEvent.changeText(screen.getByLabelText("Measured at (ISO with offset)"), "2026-01-01T08:00:00+05:30");
  await fireEvent.press(screen.getByText("Save weight"));
  await screen.findByText("Measurement saved.");
  const call = mockRequest.mock.calls.find(([method, path]) => method === "post" && path === "/api/v1/weight-logs");
  expect(call?.[2]).toMatchObject({ body: { weight_kg: "70.125", recorded_at: "2026-01-01T08:00:00+05:30", source: "manual" }, idempotencyKey: "00000000-0000-4000-8000-000000000099" });
  expect(mockRequest.mock.calls.some(([, path]) => String(path).includes("apply-goal"))).toBe(false);
});

test("weight goal apply uses both preview guards and stale409 requires a new review", async () => {
  const base = mockRequest.getMockImplementation()!;
  mockRequest.mockImplementation(async (...args: unknown[]) => {
    if (args[1] === "/api/v1/weight-logs/{weight_id}/apply-goal") throw new ApiError("Changed", 409, "WEIGHT_CHANGED");
    return base(...args);
  });
  await render(<WeightGoalScreen />);
  await fireEvent.press(screen.getByText("Calculate fresh goal preview"));
  await screen.findByText("Review and apply these targets");
  await fireEvent.press(screen.getByText("Review and apply these targets"));
  await fireEvent.press(screen.getByText("Apply reviewed goal"));
  await screen.findByText("The goal or measured weight changed after the preview. Load a new preview and review it again.");
  expect(screen.queryByText("Review and apply these targets")).toBeNull();
  const call = mockRequest.mock.calls.find(([, path]) => String(path).endsWith("/apply-goal"));
  expect(call?.[2].body).toEqual({ expected_goal_id: goalId, expected_weight_kg: "70.125" });
  expect(mockRequest.mock.calls.filter(([, path]) => String(path).endsWith("/apply-goal"))).toHaveLength(1);
});

test("water preset fills the amount and requires an explicit save", async () => {
  await render(<WaterScreen />);
  await screen.findByText("Choose 250 ml");
  await fireEvent.press(screen.getByText("Choose 250 ml"));
  expect(screen.getByLabelText("Water amount (ml)").props.value).toBe("250");
  expect(mockRequest.mock.calls.some(([method]) => method === "post")).toBe(false);
  await fireEvent.press(screen.getByText("Save water entry"));
  await screen.findByText("Water entry saved.");
  expect(mockRequest.mock.calls.find(([method, path]) => method === "post" && path === "/api/v1/water-logs")?.[2]).toMatchObject({ idempotencyKey: "00000000-0000-4000-8000-000000000099", body: { amount_ml: "250" } });
});

test("an uncertain water create retries the original body and UUID only when requested", async () => {
  const base = mockRequest.getMockImplementation()!;
  let creates = 0;
  mockRequest.mockImplementation(async (...args: unknown[]) => {
    if (args[0] === "post" && args[1] === "/api/v1/water-logs" && ++creates === 1) throw new ApiError("Response lost", 0, "NETWORK_ERROR", null, true);
    return base(...args);
  });
  await render(<WaterScreen />);
  await screen.findByText("Choose 250 ml");
  await fireEvent.press(screen.getByText("Choose 250 ml"));
  await fireEvent.press(screen.getByText("Save water entry"));
  await screen.findByText("Retry original submission safely");
  expect(creates).toBe(1);
  expect(screen.getByLabelText("Water amount (ml)").props.editable).toBe(false);
  await fireEvent.press(screen.getByText("Retry original submission safely"));
  await screen.findByText("Water entry saved.");
  const calls = mockRequest.mock.calls.filter(([method, path]) => method === "post" && path === "/api/v1/water-logs");
  expect(calls).toHaveLength(2);
  expect(calls[0][2].body).toEqual(calls[1][2].body);
  expect(calls[0][2].idempotencyKey).toEqual(calls[1][2].idempotencyKey);
});

test("water target requires confirmation and sends its explicit effective date", async () => {
  const base = mockRequest.getMockImplementation()!;
  mockRequest.mockImplementation(async (...args: unknown[]) => args[1] === "/api/v1/water/target" ? { id: waterId, ...(args[2] as any).body } : base(...args));
  await render(<WaterScreen />);
  await screen.findByText("Review daily target");
  await fireEvent.changeText(screen.getByLabelText("Target amount (ml)"), "2200");
  await fireEvent.changeText(screen.getByLabelText("Target effective date (YYYY-MM-DD)"), "2026-10-29");
  await fireEvent.press(screen.getByText("Review daily target"));
  expect(mockRequest.mock.calls.some(([method]) => method === "put")).toBe(false);
  await fireEvent.press(screen.getByText("Save daily target"));
  await screen.findByText("Daily target saved from its effective date.");
  expect(mockRequest.mock.calls.find(([method, path]) => method === "put" && path === "/api/v1/water/target")?.[2].body).toEqual({ target_ml: "2200", effective_date: "2026-10-29" });
});

test("manual activity requires review and sends a complete snapshot with explicit unknowns", async () => {
  await render(<ActivityScreen />);
  await screen.findByText("No activity snapshot exists for this date.");
  await fireEvent.changeText(screen.getByLabelText("Daily steps"), "5200");
  await fireEvent.press(screen.getByText("Review full-day replacement"));
  expect(mockRequest.mock.calls.some(([method]) => method === "put")).toBe(false);
  await fireEvent.press(screen.getByText("Save complete daily total"));
  await screen.findByText("Complete daily activity saved.");
  const body = mockRequest.mock.calls.find(([method, path]) => method === "put" && path === "/api/v1/activity/daily")?.[2].body;
  expect(body).toMatchObject({ steps: 5200, distance_m: null, active_minutes: null, activity_calories: null, source: "manual", synced_at: null });
  expect(body).not.toHaveProperty("user_id");
});

test("an imported activity day cannot be overwritten through the manual editor", async () => {
  const base = mockRequest.getMockImplementation()!;
  mockRequest.mockImplementation(async (...args: unknown[]) => args[0] === "get" && args[1] === "/api/v1/activity/daily" ? { id: goalId, activity_date: "2026-10-29", steps: 5400, distance_m: null, active_minutes: null, activity_calories: null, source: "health_connect", synced_at: "2026-10-29T08:00:00Z" } : base(...args));
  await render(<ActivityScreen />);
  await screen.findByText("This day contains an imported Health Connect snapshot. Manual values cannot replace it. You can review or explicitly delete the saved day.");
  expect(screen.getByLabelText("Daily steps").props.editable).toBe(false);
  await fireEvent.press(screen.getByText("Review full-day replacement"));
  expect(mockRequest.mock.calls.some(([method]) => method === "put")).toBe(false);
});

test("sleep notes edit preserves existing stage snapshots and requires delete confirmation", async () => {
  await render(<SleepEntryScreen />);
  await screen.findByText("No sleep stages were supplied. PROVIA does not infer deep, light or REM sleep.");
  await fireEvent.changeText(screen.getByLabelText("Sleep notes (optional)"), "Updated note");
  await fireEvent.press(screen.getByText("Save sleep changes"));
  await screen.findByText("Sleep session saved.");
  const call = mockRequest.mock.calls.find(([method]) => method === "patch");
  expect(call?.[2].body).toMatchObject({ notes: "Updated note", started_at: sleep.started_at, ended_at: sleep.ended_at });
  expect(call?.[2].body).not.toHaveProperty("stages");
  expect(call?.[2].body).not.toHaveProperty("source");
});

test("sleep deletion is explicit and never submits before confirmation", async () => {
  await render(<SleepEntryScreen />);
  await screen.findByText("Delete sleep session");
  await fireEvent.press(screen.getByText("Delete sleep session"));
  expect(mockRequest.mock.calls.filter(([method]) => method === "delete")).toHaveLength(0);
  const buttons = screen.getAllByText("Delete sleep session");
  await fireEvent.press(buttons[buttons.length - 1]);
  await waitFor(() => expect(mockRequest.mock.calls.filter(([method]) => method === "delete")).toHaveLength(1));
});

test("sleep history shows missing dates as unknown and actual recorded elapsed duration", async () => {
  await render(<SleepHistoryScreen />);
  await screen.findByText("Not recorded");
  expect(screen.getAllByText("8 h 0 min").length).toBeGreaterThan(0);
  expect(screen.getByText("No gaps are filled.", { exact: false })).toBeTruthy();
});

test("Health Connect does not request native access or upload before explicit action", async () => {
  await render(<HealthConnectScreen />);
  expect(screen.getByText("Not checked")).toBeTruthy();
  expect(screen.getByText("Not recorded for this account")).toBeTruthy();
  const native = require("../../lib/health-connect/native").nativeHealth;
  expect(native.request).not.toHaveBeenCalled();
  expect(native.read).not.toHaveBeenCalled();
  expect(mockRequest.mock.calls.every(([method]) => method === "get")).toBe(true);
});

test("activity edits after a successful save restore draft protection", async () => {
  await render(<ActivityScreen />);
  await screen.findByText("No activity snapshot exists for this date.");
  await fireEvent.changeText(screen.getByLabelText("Daily steps"), "5200");
  await fireEvent.press(screen.getByText("Review full-day replacement"));
  await fireEvent.press(screen.getByText("Save complete daily total"));
  await screen.findByText("Complete daily activity saved.");
  expect(mockPreventRemove.mock.calls.at(-1)?.[0]).toBe(false);
  await fireEvent.changeText(screen.getByLabelText("Daily steps"), "6100");
  expect(mockPreventRemove.mock.calls.at(-1)?.[0]).toBe(true);
});

test("changing the activity day requires explicit draft discard and keeps future drafts protected", async () => {
  await render(<ActivityScreen />);
  await screen.findByText("No activity snapshot exists for this date.");
  await fireEvent.changeText(screen.getByLabelText("Daily steps"), "5200");
  await fireEvent.changeText(screen.getByLabelText("Activity date (YYYY-MM-DD)"), "2026-10-20");
  await fireEvent.press(screen.getByText("Show activity day"));
  expect(screen.getByLabelText("Daily steps").props.value).toBe("5200");
  await fireEvent.press(screen.getByText("Discard changes"));
  expect(screen.getByLabelText("Daily steps").props.value).toBe("");
  await fireEvent.changeText(screen.getByLabelText("Daily steps"), "1000");
  expect(mockPreventRemove.mock.calls.at(-1)?.[0]).toBe(true);
});

test("cancelling a changed water edit confirms discard without removing another target draft", async () => {
  const base = mockRequest.getMockImplementation()!;
  mockRequest.mockImplementation(async (...args: unknown[]) => args[0] === "get" && args[1] === "/api/v1/water-logs" ? page([{ id: waterId, amount_ml: "250", consumed_at: "2026-10-29T08:00:00Z" }]) : base(...args));
  await render(<WaterScreen />);
  await fireEvent.press(await screen.findByText("Edit water entry"));
  await fireEvent.changeText(screen.getByLabelText("Water amount (ml)"), "500");
  await fireEvent.changeText(screen.getByLabelText("Target amount (ml)"), "2000");
  await fireEvent.press(screen.getByText("Cancel water edit"));
  expect(screen.getByLabelText("Water amount (ml)").props.value).toBe("500");
  await fireEvent.press(screen.getByText("Discard changes"));
  expect(screen.getByLabelText("Water amount (ml)").props.value).toBe("");
  expect(screen.getByLabelText("Target amount (ml)").props.value).toBe("2000");
  expect(mockPreventRemove.mock.calls.at(-1)?.[0]).toBe(true);
});
