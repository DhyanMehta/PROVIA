import { fireEvent, render, screen } from "@testing-library/react-native";
import Dashboard from "./dashboard";
import Onboarding from "./onboarding";
import { createApiClient } from "../lib/api-client";
import Index from "../app/index";
import { Welcome, Login, Register, VerifyEmail, ResetPassword } from "./auth";
import { Nutrition, Workouts, Tracking, Progress, FoodSearch } from "./fitness";
import Profile from "./profile";
import NextSection from "../app/next/[section]";

const mockSignOut = jest.fn();
const mockSignIn = jest.fn();
const mockPublicRequest = jest.fn();
let mockParams: { token?: string; section?: string | string[] } = {};
const mockAuth = {
  logoutPending: false,
  isSignedIn: true,
  user: { email_verified: true },
  signOut: mockSignOut,
  session: {
    signOut: mockSignOut,
    signIn: mockSignIn,
    publicApi: { request: mockPublicRequest },
  },
};
jest.mock("../providers/auth", () => ({ useAuth: () => mockAuth }));

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
  router: { replace: jest.fn(), push: jest.fn(), setParams: jest.fn() },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => mockParams,
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require("react-native");
    return <Text>Redirect:{href}</Text>;
  },
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
  mockAuth.isSignedIn = true;
  mockAuth.user.email_verified = true;
  mockAuth.logoutPending = false;
  mockParams = {};
});

test("signed-out welcome exposes pending server revocation and cleanup retry", async () => {
  mockAuth.isSignedIn = false;
  mockAuth.logoutPending = true;
  mockSignOut.mockResolvedValue(undefined);
  await render(<Welcome />);
  await fireEvent.press(screen.getByText("Retry sign-out cleanup"));
  expect(mockSignOut).toHaveBeenCalledTimes(1);
});

test("an open verification screen consumes a newly received email link", async () => {
  mockAuth.isSignedIn = false;
  mockPublicRequest.mockResolvedValue({ message: "Email verified" });
  const view = await render(<VerifyEmail />);
  expect(screen.queryByText("Confirm email verification")).toBeNull();
  mockParams = { token: "a-new-verification-link-token" };
  await view.rerender(<VerifyEmail />);
  await fireEvent.press(await screen.findByText("Confirm email verification"));
  expect(mockPublicRequest).toHaveBeenCalledWith(
    "post",
    "/api/v1/auth/verify-email",
    {
      authenticated: false,
      body: { token: mockParams.token },
      validate: expect.any(Function),
    },
  );
  expect(require("expo-router").router.setParams).toHaveBeenCalledWith({
    token: undefined,
  });
});

test("an open reset screen accepts a new token and keeps invalid links blocked", async () => {
  const view = await render(<ResetPassword />);
  expect(screen.queryByLabelText("New password")).toBeNull();
  mockParams = { token: "a-new-password-reset-link-token" };
  await view.rerender(<ResetPassword />);
  expect(await screen.findByLabelText("New password")).toBeTruthy();
  mockParams = { token: "bad" };
  await view.rerender(<ResetPassword />);
  expect(screen.queryByLabelText("New password")).toBeNull();
  expect(mockPublicRequest).not.toHaveBeenCalled();
});

test("a returning user with profile and canonical goal reaches dashboard", async () => {
  transport.mockImplementation(async (url: string) =>
    reply(
      url.endsWith("/me")
        ? { id: "user" }
        : url.endsWith("/profile")
          ? { id: "profile" }
          : {
              items: [
                { id: "goal", status: "active", calculation_method: "provia" },
              ],
            },
    ),
  );
  await render(<Index />);
  expect(await screen.findByText("Redirect:/dashboard")).toBeTruthy();
});

test("restored session stops at an auth configuration failure and permits retry", async () => {
  transport.mockResolvedValue(
    reply({ error: { code: "AUTH_UNAVAILABLE" } }, 503),
  );
  await render(<Index />);
  expect(
    await screen.findByText(/AUTH_UNAVAILABLE; HTTP 503; GET \/api\/v1\/me/),
  ).toBeTruthy();
  expect(screen.queryByText("Connecting to your account…")).toBeNull();
  expect(transport).toHaveBeenCalledTimes(1);
  expect(mockSignOut).not.toHaveBeenCalled();
  transport.mockImplementation(async (url: string) =>
    url.endsWith("/me")
      ? reply({ id: "user" })
      : url.endsWith("/profile")
        ? reply({}, 404)
        : reply({ items: [] }),
  );
  await fireEvent.press(screen.getByText("Try again"));
  expect(await screen.findByText("Redirect:/onboarding")).toBeTruthy();
});

test("invalid setup response is classified before profile or goals load", async () => {
  transport.mockResolvedValue(reply({ unexpected: true }));
  await render(<Index />);
  expect(
    await screen.findByText(/INVALID_RESPONSE; HTTP 200; GET \/api\/v1\/me/),
  ).toBeTruthy();
  expect(transport).toHaveBeenCalledTimes(1);
});

test("signed-out root redirects before requesting backend data", async () => {
  mockAuth.isSignedIn = false;
  await render(<Index />);
  expect(await screen.findByText("Redirect:/welcome")).toBeTruthy();
  expect(transport).not.toHaveBeenCalled();
});

test("welcome offers first-party login and registration navigation", async () => {
  mockAuth.isSignedIn = false;
  await render(<Welcome />);
  await fireEvent.press(screen.getByText("I already have an account"));
  expect(require("expo-router").router.push).toHaveBeenCalledWith("/login");
});
test("pending verification redirects before reading fitness data", async () => {
  mockAuth.user.email_verified = false;
  await render(<Index />);
  expect(await screen.findByText("Redirect:/verify-email")).toBeTruthy();
  expect(transport).not.toHaveBeenCalled();
});
test("first-party login preserves password whitespace and navigates after success", async () => {
  mockAuth.isSignedIn = false;
  mockSignIn.mockResolvedValue(undefined);
  await render(<Login />);
  await fireEvent.changeText(
    screen.getByLabelText("Email"),
    "test@example.com",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Password"),
    "  a long password  ",
  );
  await fireEvent.press(screen.getByText("Sign in"));
  expect(mockSignIn).toHaveBeenCalledWith(
    "test@example.com",
    "  a long password  ",
  );
  expect(require("expo-router").router.replace).toHaveBeenCalledWith("/");
});
test("registration validates confirmation before requesting credentials", async () => {
  mockAuth.isSignedIn = false;
  await render(<Register />);
  await fireEvent.press(screen.getByText("Create account"));
  expect(await screen.findByText(/Passwords must match/)).toBeTruthy();
  expect(mockPublicRequest).not.toHaveBeenCalled();
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
      weight: null,
    }),
  );
  await render(<Dashboard />);
  expect(await screen.findByText("Nothing logged yet")).toBeTruthy();
  expect(screen.getByText("No water logged")).toBeTruthy();
  expect(screen.getByText("No sleep recorded")).toBeTruthy();
  expect(screen.getAllByText("Not recorded")).toHaveLength(2);
  expect(screen.getByText(/No weight measurement recorded/)).toBeTruthy();
  expect(screen.getAllByText("1828 kcal")).toHaveLength(2);
});

function emptyDay() {
  const grams = { target_g: null, consumed_g: "0", remaining_g: null };
  return {
    date: "2026-10-26",
    timezone: "Asia/Kolkata",
    nutrition: {
      meals: [],
      calories: { target: null, consumed: "0", remaining: null },
      protein: grams,
      carbs: grams,
      fat: grams,
      fiber: grams,
    },
    water: { has_logs: false, consumed_ml: "0", target_ml: null },
    activity: null,
    workouts: { total_workouts: 0 },
    sleep: { duration_seconds: null },
    weight: null,
  };
}

test("nutrition empty meal sections navigate to real catalog search", async () => {
  transport.mockResolvedValue(reply(emptyDay()));
  await render(<Nutrition />);
  await screen.findByText("Breakfast");
  expect(screen.getAllByText("No meals recorded here yet.")).toHaveLength(4);
  await fireEvent.press(screen.getByText("Find food for breakfast"));
  expect(require("expo-router").router.push).toHaveBeenCalledWith(
    "/food-search",
  );
});

test("workout foundation renders empty server catalogs before an explicit start", async () => {
  transport.mockImplementation(async (url: string) =>
    reply(url.includes("/dashboard/today") ? emptyDay() : { items: [] }),
  );
  await render(<Workouts />);
  expect(await screen.findByText("No workout plans yet.")).toBeTruthy();
  expect(screen.getByText("No exercises available yet.")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Start workout" }).props
      .accessibilityState.disabled,
  ).toBe(false);
  expect(
    transport.mock.calls.every(([, options]) => options.method === "GET"),
  ).toBe(true);
});

test("workout start creates a real in-progress session once and does not claim completion", async () => {
  transport.mockImplementation(async (url: string, options: RequestInit) =>
    reply(
      options.method === "POST"
        ? {
            id: "workout-a",
            started_at: "2026-10-26T10:00:00Z",
            status: "in_progress",
          }
        : url.includes("/dashboard/today")
          ? emptyDay()
          : { items: [] },
      options.method === "POST" ? 201 : 200,
    ),
  );
  await render(<Workouts />);
  await fireEvent.press(await screen.findByText("Start workout"));
  expect(await screen.findByText(/It is saved as in progress/)).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Workout started" }).props
      .accessibilityState.disabled,
  ).toBe(true);
  expect(
    transport.mock.calls.filter(([, options]) => options.method === "POST"),
  ).toHaveLength(1);
});

test("a lost workout-start response is never automatically replayed", async () => {
  transport.mockImplementation(async (url: string, options: RequestInit) => {
    if (options.method === "POST") throw new Error("lost response");
    return reply(url.includes("/dashboard/today") ? emptyDay() : { items: [] });
  });
  await render(<Workouts />);
  await fireEvent.press(await screen.findByText("Start workout"));
  expect(
    await screen.findByText(/Starting again is blocked here/),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Start workout" }).props
      .accessibilityState.disabled,
  ).toBe(true);
  expect(
    transport.mock.calls.filter(([, options]) => options.method === "POST"),
  ).toHaveLength(1);
});

test.each([
  {},
  { id: "unexpected", started_at: "not-a-date", status: "in_progress" },
  { id: "unexpected", started_at: "2026-10-27T10:00:00Z", status: "completed" },
])(
  "malformed workout-start success %j remains uncertain and cannot claim completion",
  async (body) => {
    transport.mockImplementation(async (url: string, options: RequestInit) =>
      reply(
        options.method === "POST"
          ? body
          : url.includes("/dashboard/today")
            ? emptyDay()
            : { items: [] },
        options.method === "POST" ? 201 : 200,
      ),
    );
    await render(<Workouts />);
    await fireEvent.press(await screen.findByText("Start workout"));
    expect(await screen.findByText(/INVALID_RESPONSE/)).toBeTruthy();
    expect(screen.queryByText(/It is saved as in progress/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Start workout" }).props
        .accessibilityState.disabled,
    ).toBe(true);
    expect(
      transport.mock.calls.filter(([, options]) => options.method === "POST"),
    ).toHaveLength(1);
  },
);

test("workout history navigates older and newer pages without creating sessions", async () => {
  transport.mockImplementation(async (url: string) => {
    if (url.includes("/dashboard/today")) return reply(emptyDay());
    if (!url.includes("/workout-sessions")) return reply({ items: [] });
    const offset = new URL(url).searchParams.get("offset");
    return reply({
      items:
        offset === "0"
          ? Array.from({ length: 5 }, (_, index) => ({
              id: `session-${index}`,
              started_at: "2026-10-26T10:00:00Z",
              status: "in_progress",
            }))
          : [
              {
                id: "older",
                started_at: "2026-10-25T10:00:00Z",
                status: "cancelled",
              },
            ],
    });
  });
  await render(<Workouts />);
  await screen.findByText("Most recent sessions");
  await fireEvent.press(screen.getByText("Older sessions"));
  expect(await screen.findByText("Older sessions · offset 5")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Older sessions" }).props
      .accessibilityState.disabled,
  ).toBe(true);
  await fireEvent.press(screen.getByText("Newer sessions"));
  expect(await screen.findByText("Most recent sessions")).toBeTruthy();
  expect(transport.mock.calls.some(([url]) => url.includes("offset=5"))).toBe(
    true,
  );
  expect(
    transport.mock.calls.every(([, options]) => options.method === "GET"),
  ).toBe(true);
});

test.each([
  ["dashboard", Dashboard],
  ["nutrition", Nutrition],
  ["tracking", Tracking],
  ["progress", Progress],
] as const)(
  "malformed %s summaries show an API error instead of crashing",
  async (_name, Component) => {
    transport.mockResolvedValue(reply({}));
    await render(<Component />);
    expect(await screen.findByText(/INVALID_RESPONSE/)).toBeTruthy();
  },
);

test.each([
  ["Nutrition", "/nutrition"],
  ["Workouts", "/workouts"],
  ["Tracking", "/tracking"],
  ["Progress", "/progress"],
  ["unknown", "/"],
  ["constructor", "/"],
  [["Workouts", "Progress"], "/"],
] as const)(
  "legacy feature route %j resolves to a real tab or safe root",
  async (section, target) => {
    mockParams = {
      section: typeof section === "string" ? section : [...section],
    };
    await render(<NextSection />);
    expect(await screen.findByText(`Redirect:${target}`)).toBeTruthy();
  },
);

test("malformed workout lists show an API error instead of dereferencing absent items", async () => {
  transport.mockImplementation(async (url: string) =>
    reply(url.includes("/dashboard/today") ? emptyDay() : { items: null }),
  );
  await render(<Workouts />);
  expect(await screen.findByText(/INVALID_RESPONSE/)).toBeTruthy();
  expect(screen.queryByText("Start workout")).toBeNull();
});

test("malformed progress and catalog responses show safe errors", async () => {
  transport.mockImplementation(async (url: string) =>
    reply(url.includes("/dashboard/today") ? emptyDay() : {}),
  );
  const view = await render(<Progress />);
  expect(await screen.findByText(/INVALID_RESPONSE/)).toBeTruthy();
  await view.unmount();
  await render(<FoodSearch />);
  await fireEvent.changeText(screen.getByLabelText("Search foods"), "oats");
  await fireEvent.press(screen.getByText("Search"));
  expect(await screen.findByText(/INVALID_RESPONSE/)).toBeTruthy();
});

test("malformed profile summaries cannot render objects as personal information", async () => {
  transport.mockImplementation(async (url: string) =>
    reply(
      url.endsWith("/me")
        ? { id: "user" }
        : url.endsWith("/profile")
          ? { display_name: { unexpected: true } }
          : { items: [] },
    ),
  );
  await render(<Profile />);
  expect(await screen.findByText(/INVALID_RESPONSE/)).toBeTruthy();
});

test("tracking keeps unrecorded measurements distinct from logged zero steps", async () => {
  const day = emptyDay();
  transport.mockResolvedValue(
    reply({ ...day, activity: { steps: 0, active_minutes: null } }),
  );
  await render(<Tracking />);
  expect(await screen.findByText("0 steps")).toBeTruthy();
  expect(screen.getAllByText("Not recorded").length).toBeGreaterThan(0);
  expect(screen.getByText("No weight measurement recorded.")).toBeTruthy();
});

test("progress uses the backend calendar date and honest no-data states", async () => {
  transport.mockImplementation(async (url: string) =>
    reply(
      url.includes("/dashboard/today")
        ? emptyDay()
        : {
            start_date: "2026-10-20",
            end_date: "2026-10-26",
            timezone: "Asia/Kolkata",
            daily: [],
            weight_history: [],
            weight_change_kg: null,
            water_consistency: { days_met: 0, observed_days_with_target: 0 },
            workouts: { total_workouts: 0, active_days: 0 },
          },
    ),
  );
  await render(<Progress />);
  expect(
    await screen.findByText("Log weight over time to build your trend."),
  ).toBeTruthy();
  expect(
    screen.getByText(/Missing logs do not establish actual intake/),
  ).toBeTruthy();
  expect(transport.mock.calls[1][0]).toContain("start_date=2026-10-20");
  expect(transport.mock.calls[1][0]).toContain("end_date=2026-10-26");
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
