import { pendingGoalStore } from "./pending-goal";
import * as SecureStore from "expo-secure-store";
jest.mock("expo-secure-store", () => ({ getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => {}), deleteItemAsync: jest.fn(async () => {}) }));
afterEach(() => { jest.useRealTimers(); jest.clearAllMocks(); });
test("goal receipts remain isolated by account", async () => {
  await pendingGoalStore("account-one").write("first");
  await pendingGoalStore("account-two").clear();
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith("provia.pending-goal.account-one", "first");
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("provia.pending-goal.account-two");
});
test("caller timeout never lets cleanup overtake a late native marker write", async () => {
  jest.useFakeTimers();
  let release!: () => void;
  (SecureStore.setItemAsync as jest.Mock).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  const store = pendingGoalStore("slow-account");
  const saving = store.write("retained-receipt");
  const timedOut = expect(saving).rejects.toMatchObject({ code: "STORAGE_TIMEOUT" });
  await jest.advanceTimersByTimeAsync(10000);
  await timedOut;
  const clearing = store.clear();
  await Promise.resolve();
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  release();
  await clearing;
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("provia.pending-goal.slow-account");
});
