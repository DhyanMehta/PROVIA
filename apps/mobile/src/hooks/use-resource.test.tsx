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

test("changing a resource query marks retained data stale until the new request settles", async () => {
  const root = createRoot();
  let latest: ReturnType<typeof useResource<string>> | undefined;
  let finish!: (value: string) => void;
  const first = async () => "first range";
  const second = () => new Promise<string>(resolve => { finish = resolve; });
  function Probe({ load }: { load: (signal: AbortSignal) => Promise<string> }) {
    latest = useResource(load);
    return null;
  }
  try {
    await act(async () => root.render(<Probe load={first} />));
    expect(latest?.data).toBe("first range");
    expect(latest?.loading).toBe(false);
    await act(async () => root.render(<Probe load={second} />));
    expect(latest?.data).toBe("first range");
    expect(latest?.loading).toBe(true);
    await act(async () => finish("second range"));
    expect(latest?.data).toBe("second range");
    expect(latest?.loading).toBe(false);
  } finally { await act(async () => root.unmount()); }
});

test("an error belongs to its load identity and clears while a different query loads", async () => {
  const root = createRoot();
  let latest: ReturnType<typeof useResource<string>> | undefined;
  let finish!: (value: string) => void;
  const failure = new ApiError("Unavailable", 503, "DATABASE_UNAVAILABLE");
  const failed = async (): Promise<string> => { throw failure; };
  const next = () => new Promise<string>(resolve => { finish = resolve; });
  function Probe({ load }: { load: (signal: AbortSignal) => Promise<string> }) {
    latest = useResource(load);
    return null;
  }
  try {
    await act(async () => root.render(<Probe load={failed} />));
    expect(latest?.error).toBe(failure);
    await act(async () => root.render(<Probe load={next} />));
    expect(latest?.error).toBeNull();
    expect(latest?.loading).toBe(true);
    await act(async () => finish("recovered"));
    expect(latest?.data).toBe("recovered");
    expect(latest?.error).toBeNull();
  } finally { await act(async () => root.unmount()); }
});
