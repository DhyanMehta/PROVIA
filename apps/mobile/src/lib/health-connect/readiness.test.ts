import { healthConnectAccessAllowed, healthConnectReadiness } from "./readiness";

test("an unverified native build cannot claim permissions, data or a successful sync", () => {
  expect(healthConnectReadiness()).toMatchObject({ state: "native_setup_required", canRequestPermissions: false, canRead: false, canSync: false, lastSuccessfulSync: null });
});

test.each([
  { currentAccountId: "account-a", consentAccountId: "account-a", permissionGranted: true, completeRead: true },
  { currentAccountId: "account-b", consentAccountId: "account-a", permissionGranted: true, completeRead: true },
  { currentAccountId: null, consentAccountId: "account-a", permissionGranted: true, completeRead: true },
  { currentAccountId: "account-a", consentAccountId: "account-a", permissionGranted: false, completeRead: true },
  { currentAccountId: "account-a", consentAccountId: "account-a", permissionGranted: true, completeRead: false },
])("consent cannot bypass the native build gate or turn unknown/foreign data into a reading %#", input => {
  expect(healthConnectAccessAllowed({ ...input, type: "steps", selectedTypes: ["steps"] })).toBe(false);
});
