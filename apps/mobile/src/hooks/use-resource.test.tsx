import { act } from "react";
import { createRoot } from "test-renderer";
import { useResource } from "./use-resource";
import { ApiError } from "../lib/api-client";

test("the entire screen load terminates even when a dependency never settles", async () => {
  jest.useFakeTimers();
  const root = createRoot();
  let latest: ReturnType<typeof useResource<unknown>> | undefined;
  let signal: AbortSignal | undefined;
  const load = (input: AbortSignal) => {
    signal = input;
    return new Promise(() => {});
  };
  function Probe() {
    latest = useResource(load);
    return null;
  }
  try {
    await act(async () => root.render(<Probe />));
    expect(latest?.loading).toBe(true);
    await act(async () => jest.advanceTimersByTime(120000));
    expect(signal?.aborted).toBe(true);
    expect(latest?.loading).toBe(false);
    expect(latest?.error).toBeInstanceOf(ApiError);
    expect((latest?.error as ApiError).category).toBe("NETWORK_TIMEOUT");
  } finally {
    await act(async () => root.unmount());
    jest.useRealTimers();
  }
});
