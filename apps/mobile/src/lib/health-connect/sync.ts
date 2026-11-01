import type { ApiClient } from "../api-client";
import { ApiError } from "../api-client";
import type { Schema } from "../contracts";
import { dateOnly, shiftDate } from "../form-values";
import { activityData, sleepData, weightData } from "../../screens/tracking/data";

export type Category = "steps" | "weight" | "sleep";
export type Readings = { steps: number | null; weights: Schema<"WeightCreate">[]; sleeps: Schema<"SleepCreate">[] };
export type NativeHealth = {
  availability(): Promise<"available" | "update_required" | "unavailable">;
  permissions(): Promise<Category[]>;
  request(categories: Category[]): Promise<Category[]>;
  read(category: Category, start: string, end: string, signal?: AbortSignal): Promise<Readings>;
  manage(): Promise<void>;
};
export type Ledger = { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void> };
export type Outcome = { category: Category; saved: number; skipped: number; state: "saved" | "no_data" | "permission_denied" | "conflict" | "failed"; message: string };
class HealthConflict extends Error {}
function bounded<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new Error("Synchronization cancelled.")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); reject(new Error("Native operation timed out.")); }, 45000);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(value => { clearTimeout(timer); signal.removeEventListener("abort", abort); resolve(value); }, error => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(error); });
    if (signal.aborted) abort();
  });
}
const activeAccounts = new Set<string>();

/** First instant of a profile-zone date. Binary search preserves 23/25-hour DST days. */
export function dayBounds(day: string, zone: string) {
  const next = shiftDate(day, 1);
  const first = (value: string) => {
    const anchor = Date.parse(value + "T00:00:00Z");
    let low = anchor - 2 * 86400000, high = anchor + 2 * 86400000;
    while (low < high) { const middle = Math.floor((low + high) / 2); if (dateOnly(zone, new Date(middle)) < value) low = middle + 1; else high = middle; }
    if (dateOnly(zone, new Date(low)) !== value) throw new Error("This calendar date does not exist in your profile zone.");
    return new Date(low).toISOString();
  };
  return { start: first(day), end: first(next) };
}

/** No autonomous retry/background writes. Caller owns account/generation cancellation. */
export function createHealthSync(input: { accountId: string; api: ApiClient; native: NativeHealth; ledger: Ledger; current: () => boolean; identity: (value: string) => Promise<string>; now?: () => Date }) {
  let busy = false;
  let cancelled = false;
  const now = input.now ?? (() => new Date());
  const assertCurrent = (signal: AbortSignal) => { if (cancelled || signal.aborted || !input.current()) throw new Error("Synchronization cancelled. Review this account before trying again."); };
  async function permission(category: Category, signal: AbortSignal) { assertCurrent(signal); const granted = await bounded(input.native.permissions(), signal); assertCurrent(signal); if (!granted.includes(category)) throw new Error("Read permission is no longer granted. Existing saved data is unchanged."); }
  return {
    cancel() { cancelled = true; },
    async sync(day: string, zone: string, selected: Category[], signal: AbortSignal): Promise<Outcome[]> {
      if (busy || activeAccounts.has(input.accountId)) throw new Error("Synchronization is already running.");
      const today = dateOnly(zone, now());
      if (day >= today || day < shiftDate(today, -7)) throw new Error("Choose a completed day within the previous seven days.");
      const bounds = dayBounds(day, zone);
      busy = true;
      activeAccounts.add(input.accountId);
      const results: Outcome[] = [];
      try {
        assertCurrent(signal);
        if (await bounded(input.native.availability(), signal) !== "available") throw new Error("Health Connect is unavailable or needs an update.");
        for (const category of [...new Set(selected)]) {
          let saved = 0, skipped = 0;
          try {
            assertCurrent(signal);
            if (!(await bounded(input.native.permissions(), signal)).includes(category)) { results.push({ category, saved, skipped, state: "permission_denied", message: "Permission not granted; no data uploaded." }); continue; }
            const readings = await bounded(input.native.read(category, bounds.start, bounds.end, signal), signal);
            await permission(category, signal);
            if (category === "steps") {
              if (readings.steps === null) { results.push({ category, saved, skipped, state: "no_data", message: "No aggregate reading available. Missing data was not uploaded as zero." }); continue; }
              if (!Number.isInteger(readings.steps) || readings.steps < 0 || readings.steps > 200000) throw new Error("Device step total is outside the supported range.");
              const existing = await input.api.request("get", "/api/v1/activity/daily", { query: { date: day }, signal, cacheMs: 0, validate: value => value === null || activityData(value) });
              const marker = "activity-" + day;
              const seen = await bounded(input.ledger.get(marker), signal);
              let ownership: { id?: string; synced_at?: string } | null = null;
              try { ownership = seen ? JSON.parse(seen) : null; } catch { /* An unknown attempt cannot establish ownership. */ }
              if ((!existing && seen) || (existing && (existing.source !== "health_connect" || existing.distance_m !== null || existing.active_minutes !== null || existing.activity_calories !== null || ownership?.id !== existing.id || ownership?.synced_at !== existing.synced_at))) throw new HealthConflict("Activity conflict: this client cannot prove ownership of the saved snapshot. Deleted, manual or another client's data will not be overwritten.");
              if (existing) {
                if (existing.steps !== readings.steps) throw new HealthConflict("The device total changed. Review the saved activity manually; existing snapshots are not automatically replaced.");
                results.push({ category, saved: 0, skipped: 1, state: "saved", message: "The backend already contains this confirmed snapshot. No write was repeated." });
                continue;
              }
              await bounded(input.ledger.set(marker, "attempted"), signal);
              await permission(category, signal);
              const result = await input.api.request("put", "/api/v1/activity/daily", { signal, body: { activity_date: day, steps: readings.steps, source: "health_connect", synced_at: now().toISOString(), distance_m: null, active_minutes: null, activity_calories: null }, validate: activityData });
              assertCurrent(signal);
              await bounded(input.ledger.set(marker, JSON.stringify({ id: result.id, synced_at: result.synced_at })), signal);
              saved++;
            } else {
              const rows = category === "weight" ? readings.weights : readings.sleeps;
              for (const row of rows) {
                await permission(category, signal);
                if (!row.external_id) throw new Error("Stable device identity missing; record skipped.");
                const key = await input.identity(category + ":" + row.external_id);
                const previous = await bounded(input.ledger.get(key), signal);
                // A marker without a saved ID means the previous outcome was unknown. Stable
                // receipt replay is safe, including after server deletion (409, never recreate).
                if (previous && previous !== "attempted") {
                  try {
                    if (category === "weight") await input.api.request("get", "/api/v1/weight-logs/{weight_id}", { params: { weight_id: previous }, signal, cacheMs: 0, validate: weightData });
                    else await input.api.request("get", "/api/v1/sleep-sessions/{session_id}", { params: { session_id: previous }, signal, cacheMs: 0, validate: sleepData });
                  } catch (error) { if (error instanceof ApiError && error.status === 404) throw new HealthConflict("Imported record was deleted. It will not be recreated; review manually."); throw error; }
                }
                await bounded(input.ledger.set(key, previous ?? "attempted"), signal);
                await permission(category, signal);
                const result = category === "weight"
                  ? await input.api.request("post", "/api/v1/weight-logs", { body: row as Schema<"WeightCreate">, idempotencyKey: key, signal, validate: weightData })
                  : await input.api.request("post", "/api/v1/sleep-sessions", { body: row as Schema<"SleepCreate">, idempotencyKey: key, signal, validate: sleepData });
                assertCurrent(signal);
                await bounded(input.ledger.set(key, result.id), signal);
                if (previous && previous !== "attempted") skipped++; else saved++;
              }
            }
            assertCurrent(signal);
            results.push({ category, saved, skipped, state: saved || skipped ? "saved" : "no_data", message: saved || skipped ? "Backend confirmed these imports. Existing records may be replays." : "No records available in the selected day." });
          } catch (error) {
            assertCurrent(signal);
            results.push({ category, saved, skipped, state: error instanceof HealthConflict || (error instanceof ApiError && error.status === 409) ? "conflict" : "failed", message: error instanceof HealthConflict ? error.message : error instanceof ApiError ? "Backend request failed. Refresh saved records before another sync." : "Device read, permission or secure storage operation failed. No further uploads for this category; review permissions and saved records." });
          }
        }
        assertCurrent(signal);
        if (results.some(result => result.saved > 0) && results.every(result => ["saved", "no_data"].includes(result.state))) await bounded(input.ledger.set("last-success", now().toISOString()), signal);
        input.api.invalidate();
        return results;
      } finally { busy = false; activeAccounts.delete(input.accountId); }
    },
  };
}
