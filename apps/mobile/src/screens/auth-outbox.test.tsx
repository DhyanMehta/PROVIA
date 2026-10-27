import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { createApiClient } from "../lib/api-client";
import { ForgotPassword, Register, ResetPassword, VerifyEmail } from "./auth";

const transport = jest.fn();
const mockClear = jest.fn();
const mockReload = jest.fn();
let mockParams: { token?: string } = {};
const mockSession = {
  publicApi: createApiClient("https://example.test/api/v1", async () => null, transport),
  clear: mockClear,
  reloadUser: mockReload,
};
jest.mock("../providers/auth", () => ({
  useAuth: () => ({ session: mockSession, isSignedIn: false, user: null }),
}));
jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), push: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: () => mockParams,
  Redirect: () => null,
}));
jest.mock("@expo/ui", () => {
  const { View, Pressable, Text } = require("react-native");
  return {
    Host: View,
    Button: ({ label, onPress, disabled }: {
      label: string; onPress: () => void; disabled: boolean;
    }) => (
      <Pressable accessibilityRole="button" accessibilityState={{ disabled }}
        onPress={disabled ? undefined : onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
  };
});
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: require("react-native").View,
}));

const reply = (data: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => data,
  headers: new Headers(),
}) as Response;

beforeEach(() => {
  jest.clearAllMocks();
  transport.mockReset();
  mockParams = {};
  mockClear.mockResolvedValue(undefined);
});

afterEach(() => { jest.useRealTimers(); });

test("registration acceptance opens verification without claiming setup or delivery completed", async () => {
  transport.mockResolvedValue(reply({ message: "Request accepted" }, 202));
  await render(<Register />);
  await fireEvent.changeText(screen.getByLabelText("Name"), " New User ");
  await fireEvent.changeText(screen.getByLabelText("Email"), "new@example.com");
  await fireEvent.changeText(screen.getByLabelText("Password"), "  a long password  ");
  await fireEvent.changeText(screen.getByLabelText("Confirm password"), "  a long password  ");
  await fireEvent.press(screen.getByText("Create account"));
  expect(require("expo-router").router.replace).toHaveBeenCalledWith("/verify-email");
  expect(screen.getByText(/does not confirm that your account is ready/)).toBeTruthy();
  const body = JSON.parse(transport.mock.calls[0][1].body);
  expect(body).toEqual({ name: "New User", email: "new@example.com", password: "  a long password  " });
  expect(mockReload).not.toHaveBeenCalled();
});

test("resend acceptance stays generic and never claims delivery or verification", async () => {
  transport.mockResolvedValue(reply({ message: "Email delivered" }, 202));
  await render(<VerifyEmail />);
  await fireEvent.changeText(screen.getByLabelText("Email"), "unknown@example.com");
  await fireEvent.press(screen.getByText("Request verification email"));
  expect(await screen.findByText(/Delivery is not confirmed/)).toBeTruthy();
  expect(screen.queryByText("Email delivered")).toBeNull();
  expect(screen.queryByText("Email verified. Sign in to continue.")).toBeNull();
  expect(screen.getByRole("button", { name: "Resend available in 60s" }).props.accessibilityState.disabled).toBe(true);
  expect(mockReload).not.toHaveBeenCalled();
  expect(transport).toHaveBeenCalledTimes(1);
});

test("malformed registration acceptance cannot navigate as a successful request", async () => {
  transport.mockResolvedValue(reply({}, 202));
  await render(<Register />);
  await fireEvent.changeText(screen.getByLabelText("Name"), "New User");
  await fireEvent.changeText(screen.getByLabelText("Email"), "new@example.com");
  await fireEvent.changeText(screen.getByLabelText("Password"), "a long new password");
  await fireEvent.changeText(screen.getByLabelText("Confirm password"), "a long new password");
  await fireEvent.press(screen.getByText("Create account"));
  expect(await screen.findByText(/INVALID_RESPONSE/)).toBeTruthy();
  expect(require("expo-router").router.replace).not.toHaveBeenCalled();
});

test("malformed verification success cannot mark the email verified", async () => {
  mockParams = { token: "test-only-verification-action-value" };
  transport.mockResolvedValue(reply({}, 200));
  await render(<VerifyEmail />);
  await fireEvent.press(screen.getByText("Confirm email verification"));
  expect(await screen.findByText(/INVALID_RESPONSE/)).toBeTruthy();
  expect(screen.queryByText("Email verified. Sign in to continue.")).toBeNull();
  expect(mockReload).not.toHaveBeenCalled();
});

test("recovery acceptance permits an explicit retry after a bounded cooldown", async () => {
  jest.useFakeTimers();
  transport.mockResolvedValue(reply({ message: "Email delivered" }, 202));
  await render(<ForgotPassword />);
  await fireEvent.changeText(screen.getByLabelText("Email"), "unknown@example.com");
  await fireEvent.press(screen.getByText("Request reset instructions"));
  expect(await screen.findByText(/Delivery is not confirmed/)).toBeTruthy();
  expect(screen.queryByText("Email delivered")).toBeNull();
  for (let tick = 0; tick < 60; tick++) {
    await act(() => { jest.advanceTimersByTime(1000); });
  }
  await fireEvent.press(screen.getByText("Request reset instructions"));
  expect(transport).toHaveBeenCalledTimes(2);
});

test("unavailable recovery retains input and terminates the loading state", async () => {
  transport.mockResolvedValue(reply({ error: { code: "EMAIL_UNAVAILABLE" } }, 503));
  await render(<ForgotPassword />);
  await fireEvent.changeText(screen.getByLabelText("Email"), "test@example.com");
  await fireEvent.press(screen.getByText("Request reset instructions"));
  expect(await screen.findByText(/Email delivery is unavailable/)).toBeTruthy();
  expect(screen.getByLabelText("Email").props.value).toBe("test@example.com");
  expect(screen.getByRole("button", { name: "Request reset instructions" }).props.accessibilityState.disabled).toBe(false);
  expect(screen.queryByText(/Request received/)).toBeNull();
});

test("malformed acceptance is an uncertain write instead of a delivery confirmation", async () => {
  transport.mockResolvedValue(reply({ message: { delivered: true } }, 202));
  await render(<ForgotPassword />);
  await fireEvent.changeText(screen.getByLabelText("Email"), "test@example.com");
  await fireEvent.press(screen.getByText("Request reset instructions"));
  expect(await screen.findByText(/INVALID_RESPONSE/)).toBeTruthy();
  expect(screen.queryByText(/Request received/)).toBeNull();
  expect(transport).toHaveBeenCalledTimes(1);
});

test("expired verification link stays unverified and can request a replacement", async () => {
  mockParams = { token: "test-only-expired-action-value" };
  transport.mockResolvedValue(reply({ error: { code: "INVALID_ACTION" } }, 400));
  await render(<VerifyEmail />);
  expect(transport).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText("Confirm email verification"));
  expect(await screen.findByText(/invalid, expired or already used/)).toBeTruthy();
  expect(screen.queryByText("Email verified. Sign in to continue.")).toBeNull();
  expect(mockReload).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Confirm email verification" }).props.accessibilityState.disabled).toBe(false);
});

test("malformed reset success does not clear the session or claim revocation", async () => {
  mockParams = { token: "test-only-password-reset-value" };
  transport.mockResolvedValue(reply({}, 200));
  await render(<ResetPassword />);
  await fireEvent.changeText(screen.getByLabelText("New password"), "a new long password");
  await fireEvent.changeText(screen.getByLabelText("Confirm password"), "a new long password");
  await fireEvent.press(screen.getByText("Reset password"));
  expect(await screen.findByText(/INVALID_RESPONSE/)).toBeTruthy();
  expect(mockClear).not.toHaveBeenCalled();
  expect(screen.queryByText("Password reset. Previous sessions have been revoked.")).toBeNull();
  expect(screen.getByLabelText("New password").props.value).toBe("a new long password");
});

test("confirmed reset clears the session and finishes without a redirect loop", async () => {
  mockParams = { token: "test-only-password-reset-value" };
  transport.mockResolvedValue(reply({ message: "Password reset" }, 200));
  await render(<ResetPassword />);
  await fireEvent.changeText(screen.getByLabelText("New password"), "a new long password");
  await fireEvent.changeText(screen.getByLabelText("Confirm password"), "a new long password");
  await fireEvent.press(screen.getByText("Reset password"));
  expect(await screen.findByText("Password reset. Previous sessions have been revoked.")).toBeTruthy();
  expect(mockClear).toHaveBeenCalledTimes(1);
  expect(require("expo-router").router.replace).not.toHaveBeenCalled();
});
