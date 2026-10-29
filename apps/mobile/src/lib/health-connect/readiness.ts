/** Build facts, not device capability detection. No native module is included yet. */
export const HEALTH_CONNECT_BUILD = Object.freeze({
  nativeModuleIncluded: false,
  sdk58NativeCompatibilityVerified: false,
  deviceVerificationCompleted: false,
});

export type HealthDataType = "steps" | "distance" | "active_calories" | "weight" | "sleep";
export type HealthConnectReadiness = {
  state: "native_setup_required";
  canRequestPermissions: false;
  canRead: false;
  canSync: false;
  lastSuccessfulSync: null;
  reason: string;
};

export function healthConnectReadiness(): HealthConnectReadiness {
  return {
    state: "native_setup_required",
    canRequestPermissions: false,
    canRead: false,
    canSync: false,
    lastSuccessfulSync: null,
    reason: "The Health Connect native adapter is not included in this build. Expo SDK 58 / React Native 0.88 native compilation and Samsung device verification are pending.",
  };
}

/** Explicit boundary for a future adapter. It cannot turn consent into a device read. */
export function healthConnectAccessAllowed(input: {
  currentAccountId: string | null;
  consentAccountId: string | null;
  type: HealthDataType;
  selectedTypes: readonly HealthDataType[];
  permissionGranted: boolean;
  completeRead: boolean;
}): boolean {
  return HEALTH_CONNECT_BUILD.nativeModuleIncluded &&
    HEALTH_CONNECT_BUILD.sdk58NativeCompatibilityVerified &&
    !!input.currentAccountId && input.currentAccountId === input.consentAccountId &&
    input.selectedTypes.includes(input.type) && input.permissionGranted && input.completeRead;
}
