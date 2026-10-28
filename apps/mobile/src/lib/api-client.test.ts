import { ApiError, createApiClient, errorMessage } from "./api-client";
const base = "https://api.example.test/api/v1";
const response = (status: number, data: unknown = {}) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    headers: new Headers({ "x-request-id": "safe-request-id" }),
  }) as Response;

test("typed deletion accepts 204 without attempting to consume JSON", async () => {
  const reply = response(204);
  const readBody = jest.fn().mockRejectedValue(new Error("204 has no JSON body"));
  reply.json = readBody;
  const api = createApiClient(base, async () => "private-token", async () => reply);
  const result: undefined = await api.request("delete", "/api/v1/water-logs/{log_id}", {
    params: { log_id: "00000000-0000-4000-8000-000000000001" },
  });
  expect(result).toBeUndefined();
  expect(readBody).not.toHaveBeenCalled();
});

test("explicit write retry preserves its caller-owned idempotency key", async () => {
  const transport = jest.fn().mockResolvedValue(response(201, { id: "same-log" }));
  const api = createApiClient(base, async () => "private-token", transport);
  const options = {
    idempotencyKey: "00000000-0000-4000-8000-000000000001",
    body: { amount_ml: "250", consumed_at: "2026-01-01T12:00:00Z" },
  };
  await api.request("post", "/api/v1/water-logs", options);
  expect(transport).toHaveBeenCalledTimes(1);
  await api.request("post", "/api/v1/water-logs", options);
  expect(transport).toHaveBeenCalledTimes(2);
  for (const [, init] of transport.mock.calls) {
    expect(init.headers["Idempotency-Key"]).toBe(options.idempotencyKey);
    expect(init.body).toBe(JSON.stringify(options.body));
  }
});

test("keyed uncertain write still does not retry automatically", async () => {
  const transport = jest.fn().mockRejectedValue(new TypeError("network failure"));
  const api = createApiClient(base, async () => "private-token", transport);
  await expect(api.request("post", "/api/v1/water-logs", {
    idempotencyKey: "00000000-0000-4000-8000-000000000001",
    body: { amount_ml: "250", consumed_at: "2026-01-01T12:00:00Z" },
  })).rejects.toMatchObject({ uncertainWrite: true });
  expect(transport).toHaveBeenCalledTimes(1);
});

test.each([
  [401, "INVALID_AUTHENTICATION", true],
  [403, "ACCOUNT_DISABLED", true],
  [403, "EMAIL_NOT_VERIFIED", false],
])(
  "final auth rejection %s/%s only clears a rejected current session",
  async (status, code, clears) => {
    const rejected = jest.fn();
    const api = createApiClient(
      base,
      async () => "token",
      jest
        .fn()
        .mockResolvedValue(response(status as number, { error: { code } })),
      () => true,
      rejected,
    );
    await expect(
      api.request("post", "/api/v1/auth/logout-all"),
    ).rejects.toBeInstanceOf(ApiError);
    expect(rejected).toHaveBeenCalledTimes(clears ? 1 : 0);
  },
);

test("late rejected response cannot clear a newer account identity", async () => {
  const rejected = jest.fn();
  let current = true;
  const transport = jest.fn(async () => {
    current = false;
    return response(403, { error: { code: "ACCOUNT_DISABLED" } });
  });
  const api = createApiClient(
    base,
    async () => "token",
    transport,
    () => current,
    rejected,
  );
  await expect(api.request("get", "/api/v1/auth/me")).rejects.toBeInstanceOf(
    ApiError,
  );
  expect(rejected).not.toHaveBeenCalled();
});

test.each(["abort", "timeout"])(
  "%s during a shared refresh must not clear the account",
  async (mode) => {
    let token = "old-access";
    let finish!: (token: string) => void;
    const refresh = new Promise<string>((resolve) => {
      finish = (value) => {
        token = value;
        resolve(value);
      };
    });
    const getToken = jest.fn(async (force?: boolean) =>
      force ? refresh : token,
    );
    const rejected = jest.fn();
    const transport = jest
      .fn()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValue(response(200, { id: "same-user" }));
    const api = createApiClient(
      base,
      getToken,
      transport,
      () => true,
      rejected,
    );
    const controller = new AbortController();
    const request = api.request("get", "/api/v1/auth/me", {
      signal: controller.signal,
      timeoutMs: mode === "timeout" ? 50 : 1000,
    });
    const outcome = expect(request).rejects.toMatchObject({
      code: mode === "timeout" ? "TOKEN_TIMEOUT" : "ABORTED",
    });
    for (let i = 0; i < 50 && getToken.mock.calls.length < 2; i++)
      await Promise.resolve();
    expect(getToken.mock.calls.length).toBe(2);
    if (mode === "abort") controller.abort();
    await outcome;
    expect(rejected).not.toHaveBeenCalled();
    finish("new-access");
    await expect(api.request("get", "/api/v1/auth/me")).resolves.toMatchObject({
      id: "same-user",
    });
    expect(rejected).not.toHaveBeenCalled();
  },
);

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

test("an unrecorded activity day preserves the documented nullable success", async () => {
  const api = createApiClient(
    base,
    async () => "token",
    async () => response(200, null),
  );
  await expect(
    api.request("get", "/api/v1/activity/daily"),
  ).resolves.toBeNull();
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
  expect(token.mock.calls).toEqual([[undefined], [true, "private"]]);
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
  ).rejects.toMatchObject({ code: "TIMEOUT", category: "NETWORK_TIMEOUT" });
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

test("timeout settles a stuck session token request before any HTTP write", async () => {
  const transport = jest.fn();
  const api = createApiClient(base, () => new Promise(() => {}), transport);
  await expect(
    api.request("get", "/api/v1/me", { timeoutMs: 5 }),
  ).rejects.toMatchObject({
    code: "TOKEN_TIMEOUT",
    category: "TOKEN_TIMEOUT",
    uncertainWrite: false,
  });
  expect(transport).not.toHaveBeenCalled();
});

test.each([
  [401, "HTTP_401", "AUTH_REJECTED"],
  [403, "HTTP_403", "FORBIDDEN"],
  [503, "AUTH_UNAVAILABLE", "AUTH_UNAVAILABLE"],
  [503, "DATABASE_UNAVAILABLE", "DATABASE_UNAVAILABLE"],
  [502, "HTTP_502", "BACKEND_UNAVAILABLE"],
])(
  "HTTP %s %s remains distinct from a network failure",
  async (status, code, category) => {
    const transport = jest
      .fn()
      .mockResolvedValue(response(status as number, { error: { code } }));
    const api = createApiClient(base, async () => "fixture-token", transport);
    const error = await api
      .request("get", "/api/v1/me")
      .catch((error) => error);
    expect(error).toMatchObject({
      status,
      category,
      diagnostic: { method: "GET", route: "/api/v1/me", phase: "response" },
    });
    expect(transport).toHaveBeenCalledTimes(status === 401 ? 2 : 1);
    expect(errorMessage(error)).not.toContain("fixture-token");
  },
);

test("a slow Render-like startup can finish within the existing GET deadline", async () => {
  jest.useFakeTimers();
  try {
    const transport = jest.fn(
      () =>
        new Promise<Response>((resolve) =>
          setTimeout(() => resolve(response(200, { id: "user" })), 65000),
        ),
    );
    const request = createApiClient(
      base,
      async () => "token",
      transport,
    ).request("get", "/api/v1/me");
    await jest.advanceTimersByTimeAsync(65000);
    expect((await request).id).toBe("user");
    expect(transport).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

test("one deadline includes401 token refresh and transport that ignores abort", async () => {
  const transport = jest.fn().mockResolvedValue(response(401));
  const token = jest
    .fn()
    .mockResolvedValueOnce("expired")
    .mockImplementation(() => new Promise(() => {}));
  const api = createApiClient(base, token, transport);
  await expect(
    api.request("get", "/api/v1/me", { timeoutMs: 5 }),
  ).rejects.toMatchObject({ code: "TOKEN_TIMEOUT", status: 401 });
  expect(transport).toHaveBeenCalledTimes(1);
  const stuck = createApiClient(
    base,
    async () => "token",
    () => new Promise(() => {}),
  );
  await expect(
    stuck.request("get", "/api/v1/me", { timeoutMs: 5 }),
  ).rejects.toMatchObject({ code: "TIMEOUT", category: "NETWORK_TIMEOUT" });
});

test("response body consumption cannot keep the loading screen alive forever", async () => {
  const api = createApiClient(
    base,
    async () => "token",
    async () => ({ ...response(200), json: () => new Promise(() => {}) }),
  );
  await expect(
    api.request("get", "/api/v1/me", { timeoutMs: 5 }),
  ).rejects.toMatchObject({
    code: "TIMEOUT",
    status: 200,
    diagnostic: { phase: "response" },
  });
});

test("network failure, token failure, and invalid JSON have separate safe diagnostics", async () => {
  for (const [transport, token, category] of [
    [
      jest.fn().mockRejectedValue(new Error("private health/token data")),
      async () => "token",
      "NETWORK_ERROR",
    ],
    [
      jest.fn(),
      async () => {
        throw new Error("private authentication payload");
      },
      "TOKEN_UNAVAILABLE",
    ],
    [
      jest.fn().mockResolvedValue({
        ...response(200),
        json: async () => {
          throw new SyntaxError("HTML private body");
        },
      }),
      async () => "token",
      "INVALID_RESPONSE",
    ],
  ] as const) {
    const error = await createApiClient(base, token, transport)
      .request("get", "/api/v1/me")
      .catch((error) => error);
    expect(error.category).toBe(category);
    expect(errorMessage(error)).not.toContain("private");
  }
});

test("arbitrary response error codes and request IDs are not reflected", async () => {
  const api = createApiClient(
    base,
    async () => "token",
    async () => ({
      ...response(503, {
        error: { code: "private-token-health", message: "private" },
      }),
      headers: new Headers({ "x-request-id": "unsafe.value" }),
    }),
  );
  const error = await api.request("get", "/api/v1/me").catch((error) => error);
  expect(error.code).toBe("HTTP_503");
  expect(error.requestId).toBeNull();
  expect(errorMessage(error)).not.toMatch(/private|unsafe/);
});

test("a mutation with unreadable success is uncertain and is never retried", async () => {
  const transport = jest.fn().mockResolvedValue({
    ...response(201),
    json: async () => {
      throw new Error();
    },
  });
  const api = createApiClient(base, async () => "token", transport);
  await expect(
    api.request("post", "/api/v1/goals", {
      body: {
        target_weight_kg: "85",
        selected_deficit_kcal: "500",
        status: "active",
        goal_type: "weight_loss",
      },
    }),
  ).rejects.toMatchObject({ code: "INVALID_RESPONSE", uncertainWrite: true });
  expect(transport).toHaveBeenCalledTimes(1);
});
