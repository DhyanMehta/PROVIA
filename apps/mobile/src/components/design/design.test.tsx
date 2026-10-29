import { fireEvent, render, screen } from "@testing-library/react-native";
import { palettes } from "../../theme";
import { PasswordField } from "./controls";
import { ConfirmDialog } from "./dialogs";
import { PhotoContainer, validImageUri } from "./media";
import { parseOffsetDate, SelectField } from "./native-fields";
import { MacroProgress, ProgressBar } from "./progress";
import { ErrorState } from "./states";

jest.mock("@expo/ui", () => {
  const React = require("react");
  const { View, Pressable, Text } = require("react-native");
  const Picker = Object.assign(({ children, onValueChange, selectedValue, testID }: any) => <Pressable testID={testID} onPress={() => onValueChange(selectedValue === "kg" ? "lb" : "kg")}>{children}</Pressable>, { Item: ({ label }: any) => <Text>{label}</Text> });
  return { Host: ({ children }: any) => <View>{children}</View>, Button: ({ label, onPress, disabled }: any) => <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled}><Text>{label}</Text></Pressable>, Picker, BottomSheet: ({ children, isPresented }: any) => isPresented ? <View>{children}</View> : null };
});
jest.mock("@expo/ui/community/datetime-picker", () => ({ DateTimePicker: () => null }));
jest.mock("./icon", () => {
  const { View, Pressable, Text } = require("react-native");
  return { AppIcon: () => <View />, IconButton: ({ label, onPress }: any) => <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}><Text>{label}</Text></Pressable> };
});
jest.mock("expo-image", () => ({ Image: (props: any) => { const { View } = require("react-native"); return <View {...props} testID="remote-photo" />; } }));

describe("design primitives", () => {
  test("unknown values stay unknown and negative remaining stays visible", async () => {
    await render(<MacroProgress label="Protein" consumed={null} target={120} unit="g" />);
    expect(screen.getByText("Not recorded")).toBeTruthy();
    expect(screen.getByRole("progressbar").props.accessibilityValue).toEqual({ text: "Not recorded" });
    await screen.unmount();
    await render(<MacroProgress label="Protein" consumed={130} target={120} remaining={-10} unit="g" />);
    expect(screen.getByText("-10 g remaining")).toBeTruthy();
    expect(screen.getByRole("progressbar").props.accessibilityValue.now).toBe(100);
  });
  test("nonfinite progress is unknown", async () => {
    await render(<ProgressBar label="Water" value={NaN} />);
    expect(screen.getByRole("progressbar").props.accessibilityValue).toEqual({ text: "Not recorded" });
  });
  test("password visibility is explicit", async () => {
    await render(<PasswordField label="Password" />);
    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(false);
    await fireEvent.press(screen.getByRole("button", { name: "Hide password" }));
    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);
  });
  test("failure offers an explicit retry", async () => {
    const retry = jest.fn(); await render(<ErrorState message="Connection timed out" onRetry={retry} />);
    await fireEvent.press(screen.getByText("Try again")); expect(retry).toHaveBeenCalledTimes(1);
  });
  test("confirmation only calls the chosen action", async () => {
    const confirm = jest.fn(), cancel = jest.fn();
    await render(<ConfirmDialog visible title="Delete meal?" message="This removes this meal." onConfirm={confirm} onCancel={cancel} />);
    expect(confirm).not.toHaveBeenCalled(); await fireEvent.press(screen.getByText("Cancel")); expect(cancel).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText("Confirm")); expect(confirm).toHaveBeenCalledTimes(1);
  });
  test("controlled picker forwards selected value", async () => {
    const change = jest.fn(); await render(<SelectField label="Unit" value="kg" options={[{ label: "Kilograms", value: "kg" }, { label: "Pounds", value: "lb" }]} onValueChange={change} />);
    await fireEvent.press(screen.getByTestId("Unit")); expect(change).toHaveBeenCalledWith("lb");
  });
  test.each(["http://example.com/a.jpg", "data:image/png;base64,x", "https://user:password@example.com/a.jpg", "https://example.com/a.jpg?token=secret", "bad"])("rejects nonpublic image URL %s", uri => { expect(validImageUri(uri)).toBeUndefined(); });
  test("public photo loading failure uses truthful fallback", async () => {
    await render(<PhotoContainer uri="https://example.com/exercise.jpg" label="Squat demonstration" />);
    expect(screen.getByLabelText("Loading content")).toBeTruthy(); await fireEvent(screen.getByTestId("remote-photo"), "error");
    expect(screen.getByText("Photo unavailable")).toBeTruthy(); expect(screen.queryByTestId("remote-photo")).toBeNull();
  });
  test("offset timestamps require an explicit zone", async () => {
    expect(parseOffsetDate("2026-01-15T22:30:00")).toBeNull();
    expect(parseOffsetDate("2026-01-15T22:30:00+05:30")?.toISOString()).toBe("2026-01-15T17:00:00.000Z");
    expect(parseOffsetDate("2026-99-15T22:30:00Z")).toBeNull();
    expect(parseOffsetDate("2026-02-30T22:30:00Z")).toBeNull();
  });
  test("semantic text colors meet 4.5:1 on each theme surface", async () => {
    const luminance = (hex: string) => { const c = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return c[0] * .2126 + c[1] * .7152 + c[2] * .0722; };
    for (const palette of Object.values(palettes)) for (const foreground of [palette.text, palette.muted, palette.accent, palette.danger, palette.warning]) for (const background of [palette.card, palette.background]) {
      const a = luminance(foreground), b = luminance(background); expect((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
