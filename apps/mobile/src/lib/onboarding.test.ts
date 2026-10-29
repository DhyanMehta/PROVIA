import { createApiClient } from "./api-client";
import { createOnboardingSaver, decimalInput, loadSetup } from "./onboarding";
import type { Schema } from "./contracts";
jest.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-000000000001" }));
const profile: Schema<"ProfilePut"> = {
  display_name: "Test",
  height_cm: "175",
  current_weight_kg: "97",
  activity_level: "moderate",
  preferred_weight_unit: "kg",
  timezone: "Asia/Kolkata",
};
const input: Schema<"GoalCreate"> = {
  current_weight_kg: "97",
  target_weight_kg: "85",
  selected_deficit_kcal: "500",
  status: "active",
  goal_type: "weight_loss",
};
const profileOut = { ...profile, id: "profile" };
const saved = {
  id: "saved-goal",
  status: "active",
  goal_type: "weight_loss",
  calculation_method: "provia",
  current_weight_kg_snapshot: "97.000",
  target_weight_kg: "85.000",
  selected_deficit_kcal: "500.000",
  daily_calorie_target: "1828.000",
  daily_steps_target: null,
  created_at: "2026-01-01T00:00:00Z",
};
function memoryStore() {
  let value: string | null = null;
  return {
    read: async () => value,
    write: async (next: string) => {
      value = next;
    },
    clear: async () => {
      value = null;
    },
  };
}
const reply = (status: number, data: unknown) =>
  ({
    status,
    ok: status < 400,
    json: async () => data,
    headers: new Headers(),
  }) as Response;

test("double submission shares one operation and explicitly saves profile before goal", async () => {
  let hasProfile = false;
  const order: string[] = [];
  const transport = jest.fn(async (url: string, options: RequestInit) => {
    const key = options.method + " " + url.split("/api/v1")[1].split("?")[0];
    order.push(key);
    if (key === "GET /profile")
      return reply(hasProfile ? 200 : 404, hasProfile ? profileOut : {});
    if (key === "PUT /profile") {
      hasProfile = true;
      return reply(200, profileOut);
    }
    if (key === "GET /goals") return reply(200, { items: [] });
    return reply(201, saved);
  });
  const save = createOnboardingSaver(
    createApiClient(
      "https://example.test/api/v1",
      async () => "token",
      transport as typeof fetch,
    ),
    memoryStore(),
  );
  const a = save(profile, input),
    b = save(profile, input);
  expect(a).toBe(b);
  expect((await a).id).toBe("saved-goal");
  expect(order).toEqual([
    "GET /goals",
    "GET /profile",
    "PUT /profile",
    "POST /goals",
  ]);
});

test("response lost after goal write reconciles without duplicate POST or profile recalculation", async () => {
  let created = false;
  const writes: string[] = [];
  const transport = jest.fn(async (url: string, options: RequestInit) => {
    if (url.endsWith("/profile")) return reply(200, profileOut);
    if (options.method === "GET")
      return reply(200, { items: created ? [saved] : [] });
    writes.push(options.method!);
    created = true;
    throw new Error("connection lost after commit");
  });
  const save = createOnboardingSaver(
    createApiClient(
      "https://example.test/api/v1",
      async () => "token",
      transport as typeof fetch,
    ),
    memoryStore(),
  );
  await expect(save(profile, input)).rejects.toMatchObject({
    uncertainWrite: true,
  });
  expect((await save(profile, input)).id).toBe("saved-goal");
  expect(writes).toEqual(["POST"]);
});

test("returning account uses onboarding authority without scanning history", async () => {
  const transport = jest.fn(async (url: string) => {
    if (url.endsWith("/me")) return reply(200, { id: "user" });
    return reply(200, { authenticated: true, email_verified: true, profile_exists: true, active_goal_exists: true, onboarding_complete: true, next_step: "dashboard", profile: { ...profile, id: "profile" }, active_goal: saved });
  });
  const setup = await loadSetup(
    createApiClient(
      "https://example.test/api/v1",
      async () => "token",
      transport as typeof fetch,
    ),
  );
  expect(setup.active?.id).toBe("saved-goal");
  expect(transport).toHaveBeenCalledTimes(2);
  expect(transport.mock.calls[1][0]).toContain("/onboarding");
});

test.each(["-1", "", "abc", "0", "1001", "97.0001"])(
  "invalid weight %s never becomes a preview",
  (value) => {
    expect(() => decimalInput(value, "weight", 1000)).toThrow();
  },
);

test("a legacy unknown write stays blocked across coordinator restart until a positive match", async () => {
  let committed = false;
  const store = memoryStore();
  const transport = jest.fn(async (url: string, options: RequestInit) => {
    if (url.endsWith("/profile")) return reply(200, profileOut);
    if (options.method === "GET")
      return reply(200, { items: committed ? [saved] : [] });
    throw new Error("server may still be committing");
  });
  const api = createApiClient(
    "https://example.test/api/v1",
    async () => "token",
    transport as typeof fetch,
  );
  await store.write(JSON.stringify([input.goal_type, 97, 85, 500]));
  const restarted = createOnboardingSaver(api, store);
  await expect(restarted(profile, input)).rejects.toMatchObject({
    code: "GOAL_SAVE_PENDING",
  });
  expect(
    transport.mock.calls.filter(([, options]) => options.method === "POST"),
  ).toHaveLength(0);
  committed = true;
  expect((await restarted(profile, input)).id).toBe("saved-goal");
  expect(await store.read()).toBeNull();
});

test("new unknown goal creates replay the exact persisted body and UUID after restart", async () => {
  const store = memoryStore();
  const creates: RequestInit[] = [];
  const transport = jest.fn(async (url: string, options: RequestInit) => {
    if (url.endsWith("/profile")) return reply(200, profileOut);
    if (options.method === "GET") return reply(200, { items: [] });
    creates.push(options);
    if (creates.length === 1) throw new Error("response lost");
    return reply(201, saved);
  });
  const api = createApiClient("https://example.test/api/v1", async () => "token", transport as typeof fetch);
  await expect(createOnboardingSaver(api, store)(profile, input)).rejects.toMatchObject({ uncertainWrite: true });
  await expect(createOnboardingSaver(api, store)(profile, { ...input, target_weight_kg: "84" })).rejects.toMatchObject({ code: "GOAL_SAVE_PENDING" });
  expect((await createOnboardingSaver(api, store)(profile, input)).id).toBe(saved.id);
  expect(creates).toHaveLength(2);
  expect(creates[1].body).toBe(creates[0].body);
  expect((creates[1].headers as Record<string, string>)["Idempotency-Key"]).toBe((creates[0].headers as Record<string, string>)["Idempotency-Key"]);
  expect(await store.read()).toBeNull();
});

test("a pending receipt never silently replays an earlier steps target after input changes", async () => {
  const store = memoryStore(), creates: RequestInit[] = [];
  const transport = jest.fn(async (url: string, options: RequestInit) => {
    if (url.endsWith("/profile")) return reply(200, profileOut);
    if (options.method === "GET") return reply(200, { items: [] });
    creates.push(options); throw new Error("response lost");
  });
  const api = createApiClient("https://example.test/api/v1", async () => "token", transport as typeof fetch);
  await expect(createOnboardingSaver(api, store)(profile, { ...input, daily_steps_target: 8000 })).rejects.toMatchObject({ uncertainWrite: true });
  await expect(createOnboardingSaver(api, store)(profile, { ...input, daily_steps_target: 9000 })).rejects.toMatchObject({ code: "GOAL_SAVE_PENDING" });
  expect(creates).toHaveLength(1);
});

test("malformed goal success remains unresolved instead of deleting its persisted receipt", async () => {
  const store = memoryStore();
  const transport = jest.fn(async (url: string, options: RequestInit) => {
    if (url.endsWith("/profile")) return reply(200, profileOut);
    if (options.method === "GET") return reply(200, { items: [] });
    return reply(201, {});
  });
  const api = createApiClient("https://example.test/api/v1", async () => "token", transport as typeof fetch);
  await expect(createOnboardingSaver(api, store)(profile, input)).rejects.toMatchObject({ code: "INVALID_RESPONSE", uncertainWrite: true });
  expect(await store.read()).not.toBeNull();
});
