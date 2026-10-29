import { fireEvent, render, screen } from "@testing-library/react-native";
import { ObservedChart } from "./observed-chart";
test("unknown observations remain distinct from recorded zero and targets are inspectable", async () => {
  await render(<ObservedChart title="Water" unit="ml" points={[{ label: "2026-10-28", value: null, target: 2000 }, { label: "2026-10-29", value: 0, target: 2000 }]} />);
  expect(screen.getByText("0 ml")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "2026-10-28, not recorded, target 2000 ml" }));
  expect(screen.getByText("Not recorded")).toBeTruthy();
  await fireEvent.press(screen.getByText("Show all recorded values"));
  expect(screen.getAllByText("Target 2000 ml").length).toBeGreaterThan(0);
});
test("empty measured chart invents no point and exposes an honest empty state", async () => {
  await render(<ObservedChart title="Weight" unit="kg" dots points={[]} />);
  expect(screen.getByText("No observations in this range.")).toBeTruthy();
  expect(screen.queryAllByRole("button")).toHaveLength(1);
});

test("accessible recorded values stay bounded and all observations remain reachable by page", async () => {
  const points = Array.from({ length: 51 }, (_, index) => ({ label: `Observation ${String(index).padStart(3, "0")}`, value: index }));
  await render(<ObservedChart title="Measured values" unit="kg" points={points} />);
  await fireEvent.press(screen.getByText("Show all recorded values"));
  expect(screen.getByText("Values 1–20 of 51")).toBeTruthy();
  expect(screen.getByText("Observation 019")).toBeTruthy();
  expect(screen.queryByText("Observation 020")).toBeNull();
  await fireEvent.press(screen.getByText("Next value page"));
  expect(screen.getByText("Values 21–40 of 51")).toBeTruthy();
  expect(screen.queryByText("Observation 019")).toBeNull();
  expect(screen.getByText("Observation 020")).toBeTruthy();
  await fireEvent.press(screen.getByText("Next value page"));
  expect(screen.getByText("Values 41–51 of 51")).toBeTruthy();
  expect(screen.getByText("Observation 049")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Next value page" }).props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByText("Previous value page"));
  expect(screen.getByText("Values 21–40 of 51")).toBeTruthy();
});
