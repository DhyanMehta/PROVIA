import { fireEvent, render, screen } from "@testing-library/react-native";
import Dashboard from "../app/dashboard";
import Onboarding from "./onboarding";
import { createApiClient } from "../lib/api-client";

jest.mock("expo-secure-store", () => {
  let value: string | null = null;
  return {
    getItemAsync: async () => value,
    setItemAsync: async (_key: string, next: string) => {
      value = next;
    },
    deleteItemAsync: async () => {
      value = null;
    },
  };
});
jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), push: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock("../providers/api", () => ({ useApi: () => mockApi }));
jest.mock("@expo/ui", () => {
  const { View, Pressable, Text } = require("react-native");
  return {
    Host: View,
    Button: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress: () => void;
      disabled: boolean;
    }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        onPress={disabled ? undefined : onPress}
      >
        <Text>{label}</Text>
      </Pressable>
    ),
  };
});
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: require("react-native").View,
}));
const reply = (data: unknown, status = 200) =>
  ({
    ok: status < 400,
    status,
    json: async () => data,
    headers: new Headers(),
  }) as Response;
const transport = jest.fn();
const mockApi = createApiClient(
  "https://example.test/api/v1",
  async () => "fixture-token",
  transport,
);

afterEach(() => {
  jest.clearAllMocks();
});

test("dashboard renders server values and missing-data states without invented metrics", async () => {
  const grams = {
    target_g: "161.50000000",
    consumed_g: "0",
    remaining_g: "161.50000000",
  };
  transport.mockResolvedValue(
    reply({
      date: "2026-10-25",
      timezone: "Asia/Kolkata",
      nutrition: {
        meals: [],
        calories: {
          target: "1828.00000000",
          consumed: "0",
          remaining: "1828.00000000",
        },
        protein: grams,
        carbs: grams,
        fat: grams,
        fiber: grams,
      },
      water: { has_logs: false, consumed_ml: "0", target_ml: null },
      activity: null,
      workouts: { total_workouts: 0 },
      sleep: { duration_seconds: null },
    }),
  );
  await render(<Dashboard />);
  expect(await screen.findByText("Nothing logged yet")).toBeTruthy();
  expect(screen.getByText("No water logged")).toBeTruthy();
  expect(screen.getByText("No sleep recorded")).toBeTruthy();
  expect(screen.getByText("Not recorded")).toBeTruthy();
  expect(screen.getAllByText("1828 kcal")).toHaveLength(2);
});

test("invalid form stays editable and does not call calculation or save endpoints", async () => {
  transport.mockImplementation(async (url: string) =>
    url.endsWith("/me")
      ? reply({ id: "user" })
      : url.endsWith("/profile")
        ? reply({}, 404)
        : reply({ items: [] }),
  );
  await render(<Onboarding />);
  await screen.findByLabelText("Your name");
  await fireEvent.press(screen.getByText("Continue"));
  expect(
    await screen.findByText("Enter a name of 1–100 characters."),
  ).toBeTruthy();
  expect(transport).toHaveBeenCalledTimes(3);
});

test("onboarding uses backend previews, retains draft after failed confirmation, then reconciles", async () => {
  let hasProfile = false;
  let goalSaved = false;
  const goal = {
    id: "goal",
    status: "active",
    calculation_method: "provia",
    goal_type: "weight_loss",
    current_weight_kg_snapshot: "97.000",
    target_weight_kg: "85.000",
    selected_deficit_kcal: "500.000",
  };
  transport.mockImplementation(async (url: string, options: RequestInit) => {
    if (url.endsWith("/me")) return reply({ id: "user" });
    if (url.endsWith("/profile")) {
      if (options.method === "PUT") {
        hasProfile = true;
        return reply({});
      }
      return hasProfile ? reply({}) : reply({}, 404);
    }
    if (url.includes("/goals?"))
      return reply({ items: goalSaved ? [goal] : [] });
    if (url.endsWith("/nutrition/calculate-maintenance"))
      return reply({ maintenance_calories: "2328.00000000" });
    if (url.endsWith("/nutrition/calculate-goals"))
      return reply({
        daily_calorie_target: "1828.00000000",
        protein_target_g: "161.50000000",
        carbs_target_g: "142.72500000",
        fat_target_g: "67.90000000",
        fiber_target_g: "25.59200000",
      });
    goalSaved = true;
    throw new Error("response lost after commit");
  });
  await render(<Onboarding />);
  await screen.findByLabelText("Your name");
  await fireEvent.changeText(screen.getByLabelText("Your name"), "Test");
  await fireEvent.changeText(screen.getByLabelText("Height (cm)"), "175");
  await fireEvent.press(screen.getByText("Continue"));
  await fireEvent.changeText(
    screen.getByLabelText("Current weight (kg)"),
    "97",
  );
  await fireEvent.changeText(screen.getByLabelText("Target weight (kg)"), "85");
  await fireEvent.press(screen.getByText("Continue"));
  expect(await screen.findByText("2328 kcal / day")).toBeTruthy();
  await fireEvent.press(screen.getByText("Continue"));
  await fireEvent.press(screen.getByText("Preview my targets"));
  expect(await screen.findByText("25.592 g")).toBeTruthy();
  await fireEvent.press(screen.getByText("Confirm my plan"));
  expect(await screen.findByText(/save result is unknown/)).toBeTruthy();
  await fireEvent.press(screen.getByText("Confirm my plan"));
  const { router } = require("expo-router");
  expect(router.replace).toHaveBeenCalledWith("/dashboard");
  expect(
    transport.mock.calls.filter(
      ([url, options]) => url.endsWith("/goals") && options.method === "POST",
    ),
  ).toHaveLength(1);
});
