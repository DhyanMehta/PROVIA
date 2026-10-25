import * as SecureStore from "expo-secure-store";
import type { PendingGoalStore } from "./onboarding";

export function pendingGoalStore(accountId: string): PendingGoalStore {
  const key = `provia.pending-goal.${accountId}`;
  return {
    read: () => SecureStore.getItemAsync(key),
    write: (value) => SecureStore.setItemAsync(key, value),
    clear: () => SecureStore.deleteItemAsync(key),
  };
}
