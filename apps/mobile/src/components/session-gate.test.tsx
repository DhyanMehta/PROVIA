import { act } from "react";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { SessionGate } from "./session-gate";

jest.mock("./ui", () => {
  const { Text, View } = require("react-native");
  return {
    Page: View,
    Copy: Text,
    Busy: ({ label }: { label: string }) => <Text>{label}</Text>,
    ErrorNote: ({ message }: { message: string }) => <Text>{message}</Text>,
    Action: ({ label }: { label: string }) => <Text>{label}</Text>,
  };
});

test("session hydration is gated, bounded and can complete after a timeout", async () => {
  jest.useFakeTimers();
  try {
    await render(
      <SessionGate loaded={false}>
        <Text>protected content</Text>
      </SessionGate>,
    );
    expect(screen.getByText(/Restoring your secure session/)).toBeTruthy();
    expect(screen.queryByText("protected content")).toBeNull();
    await act(async () => jest.advanceTimersByTime(30000));
    expect(screen.getByText(/SESSION_INITIALIZATION_TIMEOUT/)).toBeTruthy();
    await screen.rerender(
      <SessionGate loaded>
        <Text>protected content</Text>
      </SessionGate>,
    );
    expect(screen.getByText("protected content")).toBeTruthy();
    expect(screen.queryByText(/SESSION_INITIALIZATION_TIMEOUT/)).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});
