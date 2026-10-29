import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { createApiClient } from "../lib/api-client";
import { ProfileEditor, GoalEditor } from "./profile-forms";
import Account from "../app/account";
import Profile from "./profile";
import type { Schema } from "../lib/contracts";
const mockTransport = jest.fn(), mockClear = jest.fn(), mockSignOut = jest.fn();
const mockApi = createApiClient("https://example.test/api/v1", async () => "synthetic-token", mockTransport);
jest.mock("../providers/api", () => ({ useApi: () => mockApi }));
jest.mock("../providers/auth", () => ({ useAuth: () => ({ user: { name: "Test", email: "synthetic@example.com", email_verified: true }, signOut: mockSignOut, session: { clear: mockClear } }) }));
jest.mock("expo-router", () => ({ router: { replace: jest.fn(), push: jest.fn() }, usePreventRemove: () => jest.fn() }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-000000000099" }));
jest.mock("@expo/ui", () => {
  const { View, Pressable, Text } = require("react-native");
  const Picker = Object.assign(({ children, testID }: { children: React.ReactNode; testID: string }) => <View testID={testID}>{children}</View>, { Item: ({ label }: { label: string }) => <Text>{label}</Text> });
  return { Host: View, Picker, Button: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) => <Pressable accessibilityRole="button" accessibilityState={{ disabled }} onPress={disabled ? undefined : onPress}><Text>{label}</Text></Pressable>, BottomSheet: ({ children, isPresented }: { children: React.ReactNode; isPresented: boolean }) => isPresented ? <View>{children}</View> : null };
});
jest.mock("@expo/ui/community/datetime-picker", () => ({ DateTimePicker: () => null }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: require("react-native").View }));
const profile = { id: "profile-1", user_id: "user-1", display_name: "Test", height_cm: "175.12", current_weight_kg: "97.125", date_of_birth: "1995-02-28", activity_level: "active", preferred_weight_unit: "lb", timezone: "Asia/Kolkata", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" } as Schema<"ProfileOut">;
const goal = { id: "goal-original", goal_type: "weight_loss", status: "active", target_weight_kg: "85", current_weight_kg_snapshot: "97.125", selected_deficit_kcal: "500", daily_calorie_target: "1831", daily_steps_target: 8000, calculation_method: "provia", created_at: "2026-01-01T00:00:00Z" } as Schema<"GoalOut">;
const preview = { maintenance_calories: "2352", daily_calorie_target: "1852", protein_target_g: "161.5", carbs_target_g: "147", fat_target_g: "68.6", fiber_target_g: "25.928" };
const reply = (value: unknown, status = 200) => ({ ok: status < 400, status, headers: new Headers(), json: async () => value }) as Response;
beforeEach(() => { mockTransport.mockReset(); mockApi.invalidate(); mockClear.mockReset(); mockSignOut.mockReset(); });

test("profile review preserves every unchanged field and does not silently round-trip lb into a changed kg weight", async () => {
  mockTransport.mockResolvedValue(reply(profile)); const saved = jest.fn();
  await render(<ProfileEditor profile={profile} active={goal} onSaved={saved} onCancel={jest.fn()} />);
  await fireEvent.changeText(screen.getByLabelText("Display name"), "Updated");
  await fireEvent.press(screen.getByText("Review profile changes"));
  expect(mockTransport).not.toHaveBeenCalled();
  await fireEvent.press(await screen.findByText("Confirm"));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(JSON.parse(mockTransport.mock.calls[0][1].body)).toEqual({ display_name: "Updated", height_cm: "175.12", current_weight_kg: "97.125", date_of_birth: "1995-02-28", preferred_weight_unit: "lb", activity_level: "active", timezone: "Asia/Kolkata" });
});
test("profile weight change shows actual backend targets before its confirmed replacement", async () => {
  mockTransport.mockImplementation(async (_url: string, init: RequestInit) => reply(init.method === "POST" ? preview : profile));
  await render(<ProfileEditor profile={{ ...profile, preferred_weight_unit: "kg" }} active={goal} onSaved={jest.fn()} onCancel={jest.fn()} />);
  await fireEvent.changeText(screen.getByLabelText("Profile weight (kg)"), "98");
  await fireEvent.press(screen.getByText("Review profile changes"));
  expect(await screen.findByText("1852 kcal")).toBeTruthy();
  expect(mockTransport.mock.calls.every(([, init]) => init.method !== "PUT")).toBe(true);
  await fireEvent.press(screen.getByText("Confirm"));
  await waitFor(() => expect(mockTransport.mock.calls.some(([, init]) => init.method === "PUT")).toBe(true));
});
test("goal calculation edits use the old parent ID and retain the returned revision ID", async () => {
  const saved = jest.fn(); mockTransport.mockImplementation(async (_url: string, init: RequestInit) => reply(init.method === "POST" ? preview : { ...goal, id: "goal-new-revision", target_weight_kg: "82" }));
  await render(<GoalEditor goal={goal} onSaved={saved} onCancel={jest.fn()} />);
  await fireEvent.changeText(screen.getByLabelText("Goal target weight (kg)"), "82");
  await fireEvent.press(screen.getByText("Preview revised targets"));
  await fireEvent.press(await screen.findByText("Confirm"));
  await waitFor(() => expect(saved).toHaveBeenCalledWith(expect.objectContaining({ id: "goal-new-revision" })));
  const [url, init] = mockTransport.mock.calls.find(([, init]) => init.method === "PATCH")!;
  expect(url).toContain("/goals/goal-original");
  expect(JSON.parse(init.body)).toEqual({ goal_type: "weight_loss", current_weight_kg: "97.125", target_weight_kg: "82", selected_deficit_kcal: "500", daily_steps_target: 8000 });
});
test("invalid DOB is retained for correction and never sends a profile replacement", async () => {
  await render(<ProfileEditor profile={profile} active={goal} onSaved={jest.fn()} onCancel={jest.fn()} />);
  await fireEvent.changeText(screen.getByLabelText("Date of birth (YYYY-MM-DD, optional)"), "2025-02-30");
  await fireEvent.press(screen.getByText("Review profile changes"));
  expect(await screen.findByText("Enter a valid calendar date.")).toBeTruthy(); expect(mockTransport).not.toHaveBeenCalled();
});
test("malformed session lists are rejected before a revoke control is rendered", async () => {
  mockTransport.mockResolvedValue(reply([{ id: "bad", current: true, device_label: { unsafe: true } }]));
  await render(<Account />);
  expect(await screen.findByText(/invalid API response/)).toBeTruthy(); expect(screen.queryByText("Revoke session")).toBeNull();
});
test("session revoke requires confirmation and clears the current session only after successful deletion", async () => {
  mockTransport.mockImplementation(async (_url: string, init: RequestInit) => reply(init.method === "DELETE" ? undefined : [{ id: "session-1", current: true, device_label: null, created_at: "2026-01-01T00:00:00Z", last_used_at: "2026-01-01T00:00:00Z", expires_at: "2026-12-01T00:00:00Z" }], init.method === "DELETE" ? 204 : 200));
  await render(<Account />);
  await fireEvent.press(await screen.findByText("Revoke session"));
  expect(mockTransport.mock.calls.some(([, init]) => init.method === "DELETE")).toBe(false);
  await fireEvent.press(screen.getByText("Confirm"));
  await waitFor(() => expect(mockClear).toHaveBeenCalled());
});

test("cancelling an inline goal draft retains edits until discard is confirmed", async () => {
  const cancel = jest.fn();
  await render(<GoalEditor goal={goal} onSaved={jest.fn()} onCancel={cancel} />);
  await fireEvent.changeText(screen.getByLabelText("Goal target weight (kg)"), "82");
  await fireEvent.press(screen.getByText("Cancel goal editing"));
  expect(cancel).not.toHaveBeenCalled();
  await fireEvent.press(await screen.findByText("Cancel"));
  expect(screen.getByLabelText("Goal target weight (kg)").props.value).toBe("82");
  await fireEvent.press(screen.getByText("Cancel goal editing"));
  await fireEvent.press(await screen.findByText("Confirm"));
  expect(cancel).toHaveBeenCalledTimes(1);
});

test("goal review honors pounds while retaining unchanged canonical goal kilograms", async () => {
  mockTransport.mockImplementation(async (_url: string, init: RequestInit) => reply(init.method === "POST" ? preview : goal));
  await render(<GoalEditor goal={goal} unit="lb" onSaved={jest.fn()} onCancel={jest.fn()} />);
  expect(screen.getByLabelText("Goal current weight (lb)")).toBeTruthy();
  await fireEvent.press(screen.getByText("Preview revised targets"));
  await fireEvent.press(await screen.findByText("Confirm"));
  await waitFor(() => expect(mockTransport.mock.calls.some(([, init]) => init.method === "PATCH")).toBe(true));
  const [, init] = mockTransport.mock.calls.find(([, init]) => init.method === "PATCH")!;
  expect(JSON.parse(init.body)).toMatchObject({ current_weight_kg: "97.125", target_weight_kg: "85" });
});

test("an open goal draft cannot be discarded by opening a second inline editor", async () => {
  mockTransport.mockImplementation(async (url: string) => reply(url.endsWith("/me") ? { id: "user-1" } : url.endsWith("/onboarding") ? {
    authenticated: true, email_verified: true, profile_exists: true, active_goal_exists: true, onboarding_complete: true, next_step: "dashboard", profile, active_goal: goal,
  } : { items: [goal, { ...goal, id: "goal-older", status: "paused" }] }));
  await render(<Profile />);
  const reviews = await screen.findAllByText("Review this goal");
  await fireEvent.press(reviews[0]);
  expect(screen.getByRole("button", { name: "Edit profile and preferences" }).props.accessibilityState.disabled).toBe(true);
  expect(screen.getAllByRole("button", { name: "Review this goal" }).every(control => control.props.accessibilityState.disabled)).toBe(true);
  expect(screen.getAllByRole("button", { name: /this goal$/ }).filter(control => /Activate|Pause|Complete/.test(String(control.props.accessibilityLabel ?? ""))).every(control => control.props.accessibilityState.disabled)).toBe(true);
});

test("malformed profile success retains the editable draft and reveals reconciliation outside the confirmation sheet", async () => {
  mockTransport.mockResolvedValue(reply({})); const saved = jest.fn();
  await render(<ProfileEditor profile={profile} active={goal} onSaved={saved} onCancel={jest.fn()} />);
  await fireEvent.changeText(screen.getByLabelText("Display name"), "Updated");
  await fireEvent.press(screen.getByText("Review profile changes"));
  await fireEvent.press(await screen.findByText("Confirm"));
  expect(await screen.findByText(/INVALID_RESPONSE/)).toBeTruthy();
  await waitFor(() => expect(screen.queryByText("Save profile changes?")).toBeNull());
  expect(screen.getByLabelText("Display name").props.value).toBe("Updated");
  expect(saved).not.toHaveBeenCalled();
});
