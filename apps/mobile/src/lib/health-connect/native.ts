import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import type { Category, Ledger, NativeHealth, Readings } from "./sync";
import { offsetTimestamp } from "../form-values";

const types = { steps: "Steps", weight: "Weight", sleep: "SleepSession" } as const;
async function sdk() {
  if (Platform.OS !== "android") throw new Error("Health Connect requires a compatible Android native build.");
  // Metro's literal lazy require keeps unsupported platforms from loading native code.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("react-native-health-connect") as typeof import("react-native-health-connect");
}
export const nativeHealth: NativeHealth = {
  async availability() {
    if (Platform.OS !== "android") return "unavailable";
    const api = await sdk();
    const status = await api.getSdkStatus();
    if (status === api.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return "update_required";
    if (status !== api.SdkAvailabilityStatus.SDK_AVAILABLE) return "unavailable";
    return await api.initialize() ? "available" : "unavailable";
  },
  async permissions() {
    const granted = await (await sdk()).getGrantedPermissions();
    return (Object.keys(types) as Category[]).filter(category => granted.some(permission => permission.accessType === "read" && permission.recordType === types[category]));
  },
  async request(categories) {
    const api = await sdk();
    await api.requestPermission(categories.map(category => ({ accessType: "read" as const, recordType: types[category] })));
    return nativeHealth.permissions();
  },
  async manage() { (await sdk()).openHealthConnectSettings(); },
  async read(category, start, end, signal) {
    const api = await sdk();
    const filter = { operator: "between" as const, startTime: category === "sleep" ? new Date(Date.parse(start) - 86400000).toISOString() : start, endTime: end };
    const readings: Readings = { steps: null, weights: [], sleeps: [] };
    if (category === "steps") {
      const value = await api.aggregateRecord({ recordType: "Steps", timeRangeFilter: filter });
      // v4.1.3 Kotlin maps a missing metric to 0. Require a contributing origin
      // before treating zero as observed; otherwise preserve unknown/no data.
      readings.steps = typeof value.COUNT_TOTAL === "number" && Number.isFinite(value.COUNT_TOTAL) && (value.COUNT_TOTAL !== 0 || value.dataOrigins?.length > 0) ? value.COUNT_TOTAL : null;
      return readings;
    }
    let pageToken: string | undefined;
    const tokens = new Set<string>();
    let count = 0;
    do {
      if (signal?.aborted) throw new Error("Read cancelled.");
      if (category === "weight") {
        const page = await api.readRecords("Weight", { timeRangeFilter: filter, pageSize: 100, pageToken });
        for (const row of page.records) {
          const external_id = row.metadata?.id, kg = row.weight.inKilograms;
          if (!external_id || external_id.length > 200 || !Number.isFinite(kg) || kg <= 0 || kg > 1000) throw new Error("Unsupported weight record. No partial category upload was performed.");
          const recorded_at = offsetTimestamp(row.time);
          if (Date.parse(recorded_at) >= Date.parse(end) || Date.parse(recorded_at) < Date.parse(start)) continue;
          readings.weights.push({ source: "health_connect", external_id, recorded_at, weight_kg: kg.toFixed(3) });
        }
        pageToken = page.pageToken;
      } else {
        const page = await api.readRecords("SleepSession", { timeRangeFilter: filter, pageSize: 100, pageToken });
        for (const row of page.records) {
          const external_id = row.metadata?.id;
          if (!external_id || external_id.length > 200) throw new Error("Sleep identity is missing. No partial category upload was performed.");
          const started_at = offsetTimestamp(row.startTime), ended_at = offsetTimestamp(row.endTime);
          // Whole sessions only; include sessions ending in this day, even if they began yesterday.
          if (!wakeDayIncludes(ended_at, start, end)) continue;
          if (Date.parse(ended_at) <= Date.parse(started_at) || Date.parse(ended_at) - Date.parse(started_at) > 86400000) throw new Error("Sleep interval exceeds the supported range.");
          const mapping = ["unknown", "awake", "sleeping", "awake", "light", "deep", "rem"] as const;
          const stages = row.stages?.map(stage => {
            const name = mapping[stage.stage];
            if (!name) throw new Error("Unknown sleep stage; review the record manually.");
            return { stage: name, started_at: offsetTimestamp(stage.startTime), ended_at: offsetTimestamp(stage.endTime) };
          });
          if (stages && stages.length > 500) throw new Error("Sleep stage count exceeds the supported range.");
          readings.sleeps.push({ source: "health_connect", external_id, started_at, ended_at, stages: stages?.length ? stages : null });
        }
        pageToken = page.pageToken;
      }
      count++;
      if (count > 20 || (pageToken && tokens.has(pageToken))) throw new Error("Read range is incomplete. Choose a smaller range; nothing from this category was uploaded.");
      if (pageToken) tokens.add(pageToken);
    } while (pageToken);
    return readings;
  },
};

export function wakeDayIncludes(endedAt: string, start: string, end: string) {
  return Date.parse(endedAt) >= Date.parse(start) && Date.parse(endedAt) < Date.parse(end);
}

/** Account namespace is part of both secure keys and server receipts. No raw record bodies stored. */
export function nativeLedger(accountId: string): Ledger {
  if (!/^[a-f0-9-]{36}$/i.test(accountId)) throw new Error("Valid account identity required.");
  return {
    get: key => SecureStore.getItemAsync(`provia.hc.${accountId}.${key}`),
    set: (key, value) => SecureStore.setItemAsync(`provia.hc.${accountId}.${key}`, value),
  };
}
export async function receiptIdentity(accountId: string, value: string) {
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, accountId + ":" + value);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
