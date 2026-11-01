import { ApiError, type ApiClient } from "../api-client";
import { createHealthSync, dayBounds, type NativeHealth, type Readings } from "./sync";

const now = () => new Date("2026-11-02T12:00:00Z");
const readings: Readings = { steps: 4000, weights: [], sleeps: [] };
function setup() {
  const data = new Map<string, string>();
  const request = jest.fn().mockImplementation(async method => method === "get" ? null : { id: "id", synced_at: now().toISOString() });
  const invalidate = jest.fn();
  const native: NativeHealth = { availability: jest.fn().mockResolvedValue("available"), permissions: jest.fn().mockResolvedValue(["steps", "weight", "sleep"]), request: jest.fn(), manage: jest.fn(), read: jest.fn().mockResolvedValue(readings) };
  let current = true;
  const controller = new AbortController();
  const sync = createHealthSync({ accountId: "test-account", api: { request, invalidate } as unknown as ApiClient, native, ledger: { get: async key => data.get(key) ?? null, set: async (key, value) => { data.set(key, value); } }, current: () => current, now, identity: async () => "10000000-0000-5000-a000-000000000001" });
  return { data, request, invalidate, native, controller, sync, changeAccount: () => { current = false; } };
}
test.each([["2026-03-08", 23], ["2026-11-01", 25]])("profile day %s preserves DST duration", (day, hours) => { const bounds = dayBounds(day, "America/New_York"); expect((Date.parse(bounds.end) - Date.parse(bounds.start)) / 3600000).toBe(hours); });
test("India day is not a UTC day", () => { expect(dayBounds("2026-11-01", "Asia/Kolkata")).toEqual({ start: "2026-10-31T18:30:00.000Z", end: "2026-11-01T18:30:00.000Z" }); });
test("missing steps do not upload zero", async () => { const s = setup(); (s.native.read as jest.Mock).mockResolvedValue({ ...readings, steps: null }); const result = await s.sync.sync("2026-11-01", "UTC", ["steps"], s.controller.signal); expect(result[0].state).toBe("no_data"); expect(s.request).not.toHaveBeenCalled(); });
test("known zero can upload a complete day", async () => { const s = setup(); (s.native.read as jest.Mock).mockResolvedValue({ ...readings, steps: 0 }); const result = await s.sync.sync("2026-11-01", "UTC", ["steps"], s.controller.signal); expect(result[0].saved).toBe(1); expect(s.request.mock.calls[1][2].body.steps).toBe(0); expect(s.data.has("activity-2026-11-01")).toBe(true); });
test("manual activity is never overwritten", async () => { const s = setup(); s.request.mockResolvedValue({ source: "manual" }); const result = await s.sync.sync("2026-11-01", "UTC", ["steps"], s.controller.signal); expect(result[0].state).toBe("conflict"); expect(s.request).toHaveBeenCalledTimes(1); });

test.each([4000, 5000])("existing own snapshot with steps %s is never overwritten", async steps => {
  const s = setup();
  s.data.set("activity-2026-11-01", JSON.stringify({ id: "own", synced_at: now().toISOString() }));
  s.request.mockResolvedValue({ id: "own", steps, source: "health_connect", synced_at: now().toISOString(), distance_m: null, active_minutes: null, activity_calories: null });
  const result = await s.sync.sync("2026-11-01", "UTC", ["steps"], s.controller.signal);
  expect(result[0].state).toBe(steps === 4000 ? "saved" : "conflict");
  expect(s.request).toHaveBeenCalledTimes(1);
  expect(s.request.mock.calls[0][0]).toBe("get");
});
test("another client's imported activity is never overwritten without ownership marker", async () => { const s = setup(); s.request.mockResolvedValue({ id: "remote", source: "health_connect", synced_at: now().toISOString(), distance_m: null, active_minutes: null, activity_calories: null }); const result = await s.sync.sync("2026-11-01", "UTC", ["steps"], s.controller.signal); expect(result[0].state).toBe("conflict"); expect(s.request).toHaveBeenCalledTimes(1); });
test("a saved timestamp changed by another client conflicts", async () => { const s = setup(); s.data.set("activity-2026-11-01", JSON.stringify({ id: "remote", synced_at: "2026-11-02T10:00:00Z" })); s.request.mockResolvedValue({ id: "remote", source: "health_connect", synced_at: now().toISOString(), distance_m: null, active_minutes: null, activity_calories: null }); const result = await s.sync.sync("2026-11-01", "UTC", ["steps"], s.controller.signal); expect(result[0].state).toBe("conflict"); expect(s.request).toHaveBeenCalledTimes(1); });
test("native exceptions are not echoed as private health diagnostics", async () => { const s = setup(); (s.native.read as jest.Mock).mockRejectedValue(new Error("private-measurement-details")); const result = await s.sync.sync("2026-11-01", "UTC", ["steps"], s.controller.signal); expect(result[0].state).toBe("failed"); expect(JSON.stringify(result)).not.toContain("private-measurement-details"); });
test("deleted or uncertain activity day is not recreated", async () => { const s = setup(); s.data.set("activity-2026-11-01", "attempted"); const result = await s.sync.sync("2026-11-01", "UTC", ["steps"], s.controller.signal); expect(result[0].state).toBe("conflict"); expect(s.request).toHaveBeenCalledTimes(1); });
test("partial permissions skip ungranted categories", async () => { const s = setup(); (s.native.permissions as jest.Mock).mockResolvedValue(["weight"]); const result = await s.sync.sync("2026-11-01", "UTC", ["steps", "weight"], s.controller.signal); expect(result.map(row => row.state)).toEqual(["permission_denied", "no_data"]); expect(s.request).not.toHaveBeenCalled(); });
test("revocation between read and upload stops writes", async () => { const s = setup(); (s.native.permissions as jest.Mock).mockResolvedValueOnce(["steps"]).mockResolvedValue([]); const result = await s.sync.sync("2026-11-01", "UTC", ["steps"], s.controller.signal); expect(result[0].state).toBe("failed"); expect(s.request).not.toHaveBeenCalled(); });
test("account switch during native read cancels all uploads", async () => { const s = setup(); (s.native.read as jest.Mock).mockImplementation(async () => { s.changeAccount(); return readings; }); await expect(s.sync.sync("2026-11-01", "UTC", ["steps"], s.controller.signal)).rejects.toThrow("cancelled"); expect(s.request).not.toHaveBeenCalled(); });
test("cancelled/aborted sync cannot read", async () => { const s = setup(); s.controller.abort(); await expect(s.sync.sync("2026-11-01", "UTC", ["steps"], s.controller.signal)).rejects.toThrow("cancelled"); expect(s.native.read).not.toHaveBeenCalled(); });
test("concurrent sync is rejected", async () => { const s = setup(); let finish!: (value: Readings) => void; (s.native.read as jest.Mock).mockImplementation(() => new Promise(resolve => { finish = resolve; })); const first = s.sync.sync("2026-11-01", "UTC", ["steps"], s.controller.signal); await new Promise(resolve => setTimeout(resolve, 0)); await expect(s.sync.sync("2026-11-01", "UTC", ["steps"], s.controller.signal)).rejects.toThrow("already running"); finish(readings); await first; });
test("keyed imported record deleted on backend is suppressed", async () => { const s = setup(); const key = "10000000-0000-5000-a000-000000000001"; s.data.set(key, "20000000-0000-4000-a000-000000000001"); (s.native.read as jest.Mock).mockResolvedValue({ ...readings, weights: [{ external_id: "source-id", source: "health_connect", weight_kg: "70", recorded_at: "2026-11-01T08:00:00Z" }] }); s.request.mockRejectedValue(new ApiError("Missing", 404, "RESOURCE_NOT_FOUND")); const result = await s.sync.sync("2026-11-01", "UTC", ["weight"], s.controller.signal); expect(result[0].state).toBe("conflict"); expect(s.request).toHaveBeenCalledTimes(1); expect(s.request.mock.calls[0][0]).toBe("get"); });
test.each(["2026-11-02", "2026-10-20"])("incomplete or old day %s rejected before native read", async day => { const s = setup(); await expect(s.sync.sync(day, "UTC", ["steps"], s.controller.signal)).rejects.toThrow("completed day"); expect(s.native.read).not.toHaveBeenCalled(); });
