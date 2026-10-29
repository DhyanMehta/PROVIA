import * as SecureStore from "expo-secure-store";
import type { PendingGoalStore } from "./onboarding";
import { ApiError } from "./api-client";

const queues = new Map<string, Promise<unknown>>();
function serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const result = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(operation);
  queues.set(key, result);
  void result.finally(() => { if (queues.get(key) === result) queues.delete(key); }).catch(() => {});
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new ApiError("Secure storage did not respond. Reconnect and try again.", 0, "STORAGE_TIMEOUT")), 10000); });
  // A timed-out caller never releases the native queue: late writes precede clears.
  return Promise.race([result, timeout]).finally(() => clearTimeout(timer));
}

export function pendingGoalStore(accountId: string): PendingGoalStore {
  const key = `provia.pending-goal.${accountId}`;
  return {
    read: () => serialize(key, () => SecureStore.getItemAsync(key)),
    write: (value) => serialize(key, () => SecureStore.setItemAsync(key, value)),
    clear: () => serialize(key, () => SecureStore.deleteItemAsync(key)),
  };
}
