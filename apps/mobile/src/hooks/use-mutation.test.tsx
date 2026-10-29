import { act, render, waitFor } from "@testing-library/react-native";
import { ApiError } from "../lib/api-client";
import { useMutation } from "./use-mutation";
import { useLayoutEffect } from "react";
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn(() => "00000000-0000-4000-8000-000000000001") }));
let mutation: ReturnType<typeof useMutation>;
function Probe() { const current = useMutation(); useLayoutEffect(() => { mutation = current; }); return null; }
test("same-tick submissions share the latch; unknown retry retains original callback and identity", async () => {
  await render(<Probe />);
  const original = jest.fn().mockRejectedValueOnce(new ApiError("Unknown", 0, "TIMEOUT", null, true)).mockResolvedValueOnce({ id: "saved" });
  const changed = jest.fn();
  await act(async () => { await Promise.all([mutation.run(original, { idempotent: true }), mutation.run(changed, { idempotent: true })]); });
  expect(original).toHaveBeenCalledTimes(1); expect(changed).not.toHaveBeenCalled();
  expect(mutation.uncertain).toBe(true);
  await act(async () => { await mutation.run(changed, { idempotent: true }); await mutation.retry(); });
  expect(changed).not.toHaveBeenCalled(); expect(original.mock.calls[1]).toEqual(original.mock.calls[0]);
  await waitFor(() => expect(mutation.uncertain).toBe(false));
});
test("unkeyed uncertain writes never replay and validation failures remain editable", async () => {
  await render(<Probe />);
  const unknown = jest.fn().mockRejectedValue(new ApiError("Unknown", 503, "DATABASE_UNAVAILABLE", null, true));
  await act(async () => { await mutation.run(unknown); await mutation.retry(); });
  expect(unknown).toHaveBeenCalledTimes(1);
  await act(async () => mutation.reset());
  await act(async () => { await mutation.run(async () => { throw new ApiError("Read failed", 503, "DATABASE_UNAVAILABLE"); }); });
  expect(mutation.uncertain).toBe(false);
  const valid = jest.fn().mockResolvedValue({ id: "saved" });
  await act(async () => { await mutation.run(valid); }); expect(valid).toHaveBeenCalledTimes(1);
});
