import { ApiError, createApiClient, errorMessage } from "./api-client";
const base = "https://api.example.test/api/v1";
const response = (status: number, data: unknown = {}) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    headers: new Headers({ "x-request-id": "safe-request-id" }),
  }) as Response;

test("typed request attaches bearer and preserves decimal strings", async () => {
  const transport = jest
    .fn()
    .mockResolvedValue(response(200, { consumed_ml: "250.125" }));
  const api = createApiClient(base, async () => "private-token", transport);
  const result = await api.request("get", "/api/v1/water/dashboard", {
    query: { date: "2026-10-25" },
  });
  expect(result.consumed_ml).toBe("250.125");
  expect(transport.mock.calls[0][0]).toBe(
    base + "/water/dashboard?date=2026-10-25",
  );
  expect(transport.mock.calls[0][1].headers.Authorization).toBe(
    "Bearer private-token",
  );
});

test.each([401, 403, 404, 409, 422, 429, 500, 503])(
  "safe error category and request ID for %s",
  async (status) => {
    const transport = jest.fn().mockResolvedValue(
      response(status, {
        error: { code: "SAFE_CODE", message: "private-provider-details" },
      }),
    );
    const api = createApiClient(base, async () => "private-token", transport);
    try {
      await api.request("post", "/api/v1/nutrition/calculate-maintenance", {
        authenticated: false,
        body: { current_weight_kg: "97" },
      });
      throw new Error("must fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(errorMessage(error)).toContain("safe-request-id");
      expect(errorMessage(error)).not.toContain("private");
      expect(transport).toHaveBeenCalledTimes(1);
    }
  },
);

test("GET refreshes once on401; POST never automatically retries", async () => {
  const transport = jest
    .fn()
    .mockResolvedValueOnce(response(401))
    .mockResolvedValueOnce(response(200, { id: "user" }));
  const token = jest.fn().mockResolvedValue("private");
  const api = createApiClient(base, token, transport);
  expect((await api.request("get", "/api/v1/me")).id).toBe("user");
  expect(token.mock.calls).toEqual([[undefined], [true]]);
  transport.mockReset().mockResolvedValue(response(401));
  await expect(
    api.request("post", "/api/v1/goals", {
      body: {
        target_weight_kg: "85",
        selected_deficit_kcal: "500",
        status: "active",
        goal_type: "weight_loss",
      },
    }),
  ).rejects.toMatchObject({ status: 401 });
  expect(transport).toHaveBeenCalledTimes(1);
});

test("unknown write outcome is explicit, not retried", async () => {
  const transport = jest
    .fn()
    .mockRejectedValue(new Error("private-network-detail"));
  const api = createApiClient(base, async () => "private", transport);
  await expect(
    api.request("post", "/api/v1/goals", {
      body: {
        target_weight_kg: "85",
        selected_deficit_kcal: "500",
        status: "active",
        goal_type: "weight_loss",
      },
    }),
  ).rejects.toMatchObject({ uncertainWrite: true, status: 0 });
  expect(transport).toHaveBeenCalledTimes(1);
});

test("caller cancellation and timeout abort transport", async () => {
  const transport = jest.fn(
    (_url, options: RequestInit) =>
      new Promise<Response>((_resolve, reject) =>
        options.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        ),
      ),
  );
  const api = createApiClient(
    base,
    async () => "private",
    transport as typeof fetch,
  );
  await expect(
    api.request("get", "/api/v1/me", { timeoutMs: 5 }),
  ).rejects.toMatchObject({ code: "ABORTED" });
  const cancelled = new AbortController();
  cancelled.abort();
  await expect(
    api.request("get", "/api/v1/me", { signal: cancelled.signal }),
  ).rejects.toMatchObject({ code: "ABORTED" });
});

test("stale account clients cannot continue writes under a new account", async () => {
  let sameAccount = true;
  const transport = jest.fn();
  const api = createApiClient(
    base,
    async () => {
      sameAccount = false;
      return "new-account-token";
    },
    transport,
    () => sameAccount,
  );
  await expect(
    api.request("post", "/api/v1/goals", {
      body: {
        target_weight_kg: "85",
        selected_deficit_kcal: "500",
        status: "active",
        goal_type: "weight_loss",
      },
    }),
  ).rejects.toMatchObject({ code: "SESSION_CHANGED" });
  expect(transport).not.toHaveBeenCalled();
});

test("timeout settles a stuck Clerk token request before any HTTP write", async () => {
  const transport = jest.fn();
  const api = createApiClient(base, () => new Promise(() => {}), transport);
  await expect(
    api.request("get", "/api/v1/me", { timeoutMs: 5 }),
  ).rejects.toMatchObject({ code: "ABORTED", uncertainWrite: false });
  expect(transport).not.toHaveBeenCalled();
});
