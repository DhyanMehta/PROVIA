import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { ConfirmDialog } from "./dialogs";

// Jest cannot reproduce Android's native touch assertion. Guard the mitigation:
// neither the sheet nor its actions may reintroduce a Compose Host boundary.
jest.mock("@expo/ui", () => { throw new Error("Confirmation must not load Expo UI native hosts"); });

describe("confirmation dialog", () => {
  test("only explicit confirmation submits, including after cancellation and reopening", async () => {
    const confirm = jest.fn(), cancel = jest.fn();
    const props = { title: "Confirm Health Connect day", message: "Yesterday · This device", onConfirm: confirm, onCancel: cancel, confirmLabel: "I confirm this day and device" };
    await render(<ConfirmDialog {...props} visible={false} />);
    expect(screen.queryByText(props.confirmLabel)).toBeNull();
    await screen.rerender(<ConfirmDialog {...props} visible />);
    expect(confirm).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    await screen.rerender(<ConfirmDialog {...props} visible={false} />);
    await screen.rerender(<ConfirmDialog {...props} visible />);
    await fireEvent.press(screen.getByRole("button", { name: props.confirmLabel }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test("Android back and backdrop cancel without submitting", async () => {
    const confirm = jest.fn(), cancel = jest.fn();
    await render(<ConfirmDialog visible title="Confirm?" message="Review this first." onConfirm={confirm} onCancel={cancel} />);
    await fireEvent(screen.getByTestId("confirmation-dialog"), "requestClose");
    await fireEvent.press(screen.getByTestId("confirmation-backdrop", { includeHiddenElements: true }));
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(confirm).not.toHaveBeenCalled();
  });

  test("pending confirmation blocks duplicate submit and every cancellation route, then closes", async () => {
    const confirm = jest.fn(), cancel = jest.fn();
    function PendingConfirmation() {
      const [busy, setBusy] = useState(false);
      return <ConfirmDialog visible title="Confirm?" message="Review this first." busy={busy}
        onConfirm={() => { confirm(); setBusy(true); }} onCancel={cancel} />;
    }
    await render(<PendingConfirmation />);
    await fireEvent.press(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByLabelText("Saving")).toBeTruthy();
    const submit = screen.getByRole("button", { name: "Confirm…" });
    expect(submit.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    await fireEvent.press(submit);
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    await fireEvent.press(screen.getByTestId("confirmation-backdrop", { includeHiddenElements: true }));
    await fireEvent(screen.getByTestId("confirmation-dialog"), "requestClose");
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    await screen.rerender(<ConfirmDialog visible={false} title="Confirm?" message="Done" onConfirm={confirm} onCancel={cancel} />);
    expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
  });
});
