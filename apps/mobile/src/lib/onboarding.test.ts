import { createApiClient } from "./api-client";
import { createOnboardingSaver, decimalInput, loadSetup } from "./onboarding";
import type { Schema } from "./contracts";
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
const saved = {
  id: "saved-goal",
  status: "active",
  goal_type: "weight_loss",
  calculation_method: "provia",
  current_weight_kg_snapshot: "97.000",
  target_weight_kg: "85.000",
  selected_deficit_kcal: "500.000",
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
      return reply(hasProfile ? 200 : 404, hasProfile ? profile : {});
    if (key === "PUT /profile") {
      hasProfile = true;
      return reply(200, profile);
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
    if (url.endsWith("/profile")) return reply(200, profile);
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

test("returning account searches beyond the first history page", async () => {
  const transport = jest.fn(async (url: string) => {
    if (url.endsWith("/me")) return reply(200, { id: "user" });
    if (url.endsWith("/profile")) return reply(200, profile);
    return reply(200, {
      items: url.includes("offset=100")
        ? [saved]
        : Array.from({ length: 100 }, () => ({ ...saved, status: "paused" })),
    });
  });
  const setup = await loadSetup(
    createApiClient(
      "https://example.test/api/v1",
      async () => "token",
      transport as typeof fetch,
    ),
  );
  expect(setup.active?.id).toBe("saved-goal");
  expect(transport).toHaveBeenCalledTimes(4);
});

test.each(["-1", "", "abc", "0", "1001", "97.0001"])(
  "invalid weight %s never becomes a preview",
  (value) => {
    expect(() => decimalInput(value, "weight", 1000)).toThrow();
  },
);

test("an in-flight unknown write stays blocked across coordinator restart until a positive match", async () => {
  let committed = false;
  const store = memoryStore();
  const transport = jest.fn(async (url: string, options: RequestInit) => {
    if (url.endsWith("/profile")) return reply(200, profile);
    if (options.method === "GET")
      return reply(200, { items: committed ? [saved] : [] });
    throw new Error("server may still be committing");
  });
  const api = createApiClient(
    "https://example.test/api/v1",
    async () => "token",
    transport as typeof fetch,
  );
  await expect(
    createOnboardingSaver(api, store)(profile, input),
  ).rejects.toMatchObject({ uncertainWrite: true });
  const restarted = createOnboardingSaver(api, store);
  await expect(restarted(profile, input)).rejects.toMatchObject({
    code: "GOAL_SAVE_PENDING",
  });
  expect(
    transport.mock.calls.filter(([, options]) => options.method === "POST"),
  ).toHaveLength(1);
  committed = true;
  expect((await restarted(profile, input)).id).toBe("saved-goal");
  expect(await store.read()).toBeNull();
});
