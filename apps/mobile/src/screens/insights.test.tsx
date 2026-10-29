import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { createApiClient } from "../lib/api-client";
import type { Schema } from "../lib/contracts";
import { DashboardContext } from "./dashboard-context";
import ProgressScreen, { progressCheck } from "./progress";
jest.mock("expo-router", () => ({ router: { push: jest.fn(), replace: jest.fn() }, usePreventRemove: () => () => {}, useLocalSearchParams: () => ({}) }));
jest.mock("../providers/api", () => ({ useApi: () => mockApi }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-000000000001" }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: require("react-native").View }));
jest.mock("@expo/ui", () => {
  const { View, Pressable, Text } = require("react-native");
  return { Host: View, BottomSheet: () => null, Button: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}><Text>{label}</Text></Pressable> };
});
const reply = (value: unknown, status = 200) => ({ status, ok: status < 400, headers: new Headers(), json: async () => value }) as Response;
let mockTransport: jest.Mock, mockApi: ReturnType<typeof createApiClient>;
beforeEach(() => { jest.clearAllMocks(); mockTransport = jest.fn(); mockApi = createApiClient("https://test.invalid/api/v1", async () => "synthetic", mockTransport); });

test("dashboard opens the actual persisted active workout and displays goal reference beside observed weight", async () => {
  mockTransport.mockImplementation(async (url: string) => {
    if (url.includes("/workout-sessions/active")) return reply({ id: "actual-saved", status: "in_progress", workout_plan_day_id: null, started_at: "2026-10-29T10:00:00Z", completed_at: null, notes: null, plan_snapshot: null, sets: [] });
    if (url.includes("/workout-plans")) return reply({ items: [], limit: 100, offset: 0 });
    return reply({ items: [{ id: "00000000-0000-4000-8000-000000000002", weight_kg: "90.000", recorded_at: "2026-10-29T10:00:00Z", created_at: "2026-10-29T10:00:00Z", source: "manual", external_id: null, user_id: "00000000-0000-4000-8000-000000000003" }], limit: 60, offset: 0 });
  });
  await render(<DashboardContext date="2026-10-29" zone="Asia/Kolkata" unit="lb" target="85.000" />);
  await fireEvent.press(await screen.findByText("Resume your saved active workout"));
  expect(router.push).toHaveBeenCalledWith({ pathname: "/workouts/sessions/[sessionId]", params: { sessionId: "actual-saved" } });
  expect(screen.getByText("187.393 lb")).toBeTruthy();
  expect(await screen.findByText("198.416 lb")).toBeTruthy();
});
const macro = { consumed_g: null, target_g: "100", remaining_g: null, adherence_ratio: null };
function overview(): Schema<"ProgressOverview"> {
  return { start_date: "2026-10-29", end_date: "2026-10-29", timezone: "Asia/Kolkata", weight_history: [], weight_change_kg: null,
    water_consistency: { days_met: 0, observed_days_with_target: 0 },
    workouts: { start_date: "2026-10-29", end_date: "2026-10-29", timezone: "Asia/Kolkata", active_days: 0, consistency_ratio: "0", total_workouts: 0, total_duration_seconds: null, total_volume_kg: "0", workouts_this_week: 0, workouts_this_month: 0, daily: [{ date: "2026-10-29", count: 0, volume_kg: "0" }], history: [], personal_records: {} },
    daily: [{ date: "2026-10-29", activity: null, sleep: { duration_seconds: null, session_count: 0 }, water: { has_logs: false, consumed_ml: "0", target_ml: null, target_met: null, remaining_ml: null }, nutrition: { has_logs: true, calories_consumed: "2200", calories_target: "2000", goal_id: "goal", adherence_ratio: "1.1", protein: macro, carbs: macro, fat: macro, fiber: macro } }] };
}
test("progress renders server calorie adherence and requests an actual 30-day profile-zone range", async () => {
  mockTransport.mockImplementation(async (url: string) => reply(url.includes("/profile") ? { timezone: "Asia/Kolkata", preferred_weight_unit: "lb" } : overview()));
  await render(<ProgressScreen />);
  expect(await screen.findByText("Calorie adherence")).toBeTruthy();
  expect(screen.getByText("110 % of historical target")).toBeTruthy();
  expect(screen.getByText("Fiber consumed and target")).toBeTruthy();
  await fireEvent.press(screen.getByText("Last 30 days"));
  await waitFor(() => {
    const urls = mockTransport.mock.calls.map(([url]) => String(url)).filter(url => url.includes("/progress/overview"));
    const query = new URL(urls[urls.length - 1]).searchParams;
    expect((Date.parse(query.get("end_date")!) - Date.parse(query.get("start_date")!)) / 86400000).toBe(29);
  });
});
test("progress rejects missing adherence and non-finite decimal payloads before chart rendering", () => {
  const value = overview(); expect(progressCheck(value)).toBe(true);
  value.daily[0].nutrition.adherence_ratio = "9".repeat(500); expect(progressCheck(value)).toBe(false);
  delete (value.daily[0].nutrition as Partial<Schema<"NutritionDay">>).adherence_ratio; expect(progressCheck(value)).toBe(false);
});
test("progress accepts persisted PostgreSQL zero-exponent nutrients without treating them as missing", () => {
  const value = overview();
  value.daily[0].nutrition.fiber = { consumed_g: "0E-8", target_g: "30.00000000", remaining_g: "30.00000000", adherence_ratio: "0E-8" };
  expect(progressCheck(value)).toBe(true);
});
