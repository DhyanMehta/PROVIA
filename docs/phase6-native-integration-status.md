# Phase 6 native integration status

30 October 2026. Audited from `fc58387401bcae9c874611718aeb280454ea5c52`.
This is source/configuration review and local automated evidence, not device evidence.
No native Health Connect adapter was installed, no sensor data was uploaded and the
existing secure session controller was preserved.

| Integration | Source status | Native acceptance |
| --- | --- | --- |
| Barcode camera | Implemented, optional permission, manual fallback, duplicate suppression and failure handling | PARTIAL; real camera and label matching NOT VERIFIED |
| SecureStore | Existing native adapter and plugin; refresh credentials only, serialized rotation/cleanup retained | LOCALLY TESTED ONLY |
| Verification/reset links | Existing public routes and `provia` intent filter; explicit confirmation and route-parameter removal | LOCALLY TESTED ONLY |
| App lifecycle/account isolation | Restore controller, account generation guards and foreground cache invalidation retained | LOCALLY TESTED ONLY |
| Health Connect | Native module absent; permission/read/sync capability stays false and last sync null | BLOCKED |

## Camera review

Installed `expo-camera` is `~58.0.14`; configuration uses `barcodeScannerEnabled:true`,
`microphonePermission:false`, `recordAudioAndroid:false`. Existing generated Android
manifest contains CAMERA and no RECORD_AUDIO. This is prebuild source, not the final
merged APK manifest. The [SDK58 camera reference](https://docs.expo.dev/versions/v58.0.0/sdk/camera/)
documents the permission hook, CameraView and barcode callback used by the screen.

`src/screens/nutrition/barcode.tsx` mounts the back camera only when focused, enabled,
permitted and without a mount error. It accepts EAN13/EAN8/UPC-A/UPC-E/ITF14; bounded
ASCII digit validation preserves leading zeroes. A synchronous ref blocks duplicate
events. Lookup is an authenticated GET to `/api/v1/foods/barcode/{barcode}`, validated
as FoodOut before replacing the route with `/nutrition/food/[food_id]`. Blur aborts
the request and a late response cannot navigate. No photo capture/upload is used.

Denial retains manual input; permanent denial exposes Settings. Mount error stops
camera with manual fallback. A404 exposes catalog/custom-food options; provider/network
failure remains an error rather than a fabricated product. New mocked-component cases
exercise mount failure/manual continuation, unmount cancellation, permanent denial
and provider failure/loading termination, in addition to existing scan deduplication,
manual lookup and404 tests. They do not prove optical decoding or Android permissions.

## SecureStore and links

`src/providers/auth.tsx` binds the existing controller to SecureStore get/set/delete
under `provia.auth.refresh.v1`, with `expo/fetch`; it calls restore on mount. Access
tokens stay in memory. `auth-session.ts` retains serialized storage, rotation markers,
single-flight refresh, finite deadlines and generation checks. No logging statements
were found in that controller. `ApiProvider` cancels account-bound requests on disposal
and invalidates reads on foreground/minute refresh. No background sync was added.

The [SDK58 SecureStore reference](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/)
requires backup exclusion because restored credentials cannot be decrypted with a
removed Android keystore. Generated manifest references the package's backup/data
extraction XML; installed XML excludes the `SecureStore` preferences for cloud backup
and device transfer. Final merged manifest and real Android persistence remain gates.

Root/index and public auth routes exist. `provia`/`exp+provia` VIEW+BROWSABLE intent
filters target a singleTask activity. Verification/reset screens retain the bounded
action token in component memory, clear it from Router params, and require an explicit
button action. They do not verify or reset simply by opening a link. Confirmed reset
clears local session state; errors do not claim success. Use
`provia:///verify-email?token=...` and `provia:///reset-password?token=...` from real
received links; never put real tokens into shell history or screenshots. Custom schemes
are not verified HTTPS Android App Links; another installed app can claim the scheme.
One-time/short-lived server actions and explicit confirmation remain essential. No
claim of verified-domain link ownership is made.

Existing controller tests simulate storage failure, uncertain rotation, late writes,
account changes and restore. Auth screen tests simulate link params and HTTP responses;
they do not test Android intent dispatch, keystore, process restart or email arrival.
See the Samsung plan for cold/warm links, restart, Back and revoked-session acceptance.

## Health Connect implementation gap and safe mapping

`health-connect/readiness.ts` deliberately reports no native adapter, no verified SDK58
compatibility and no completed device test. All permission/read/sync gates remain false.
The UI makes no permission or backend call and does not turn failed permission into0.

The candidate [react-native-health-connect v4 integration](https://matinzd.github.io/react-native-health-connect/docs/get-started/)
includes its own Expo plugin/permission delegate and requires a custom native build,
not Expo Go; its example specifies minSDK26 and compile/target36. This project already
sets minSDK26. Documentation support is not proof of compilation against Expo58/RN0.88.1.
Do not add the deprecated separate `expo-health-connect` plugin or downgrade this
project's platform versions to copy an example. An alternative is an explicitly
maintained Expo native module around AndroidX Health Connect; that also needs a native
build and device verification. Neither option was installed in this phase.

[Android availability guidance](https://developer.android.com/health-and-fitness/health-connect/get-started)
distinguishes the Android14+ framework provider from older separately installed
providers. A future adapter must inspect SDK status (available/unavailable/update
required), initialize, and re-read granted permissions. Device OS must be observed,
not inferred from the Galaxy model. Never equate initialization success with read consent.

The selected read-only scope would require `android.permission.health.READ_STEPS`,
`READ_DISTANCE`, `READ_ACTIVE_CALORIES_BURNED`, `READ_WEIGHT`, and `READ_SLEEP`, each
prefixed by `android.permission.health.`. Request only user-selected types; do not add
write/background/history permissions by default. Declare matching privacy/rationale
handling and any store health-data access before release. See the official
[data-type permission table](https://developer.android.com/health-and-fitness/health-connect/data-types).

| Data | Frozen backend mapping | Required safety decisions before implementation |
| --- | --- | --- |
| Steps/distance/energy | Daily ActivityPut: date, integer steps, optional metres, active minutes and kcal, source=`health_connect`, aware synced_at | Use provider aggregate for the complete profile-zone day; permission failure/incomplete read is unknown. Do not sum overlapping raw phone/watch steps. Missing optional metrics remain null; no invented active minutes. |
| Weight | WeightCreate: canonical kg, recorded_at, source and external_id | Stable provider metadata ID scoped to account/type/origin; retain imported ID→backend ID reconciliation. Unchanged replay is accepted; changed value/time returns SOURCE_RECORD_CONFLICT409. Do not silently revise goals. |
| Sleep | SleepCreate: start/end, source, external_id, optional ordered stage intervals | Map supplied stages to awake/light/deep/rem/sleeping/unknown; preserve offsets, max24h, <=500 stages and no overlap. Unchanged ID replay accepted; changed import returns SYNC_CONFLICT409, overlaps SLEEP_OVERLAP409. |

The [Android aggregate API](https://developer.android.com/health-and-fitness/health-connect/aggregate-data)
provides cumulative metrics and origin filtering; use its deduplicated results where
supported, with explicit absence handling. Validate device/provider-specific behavior
using actual overlapping records, profile-zone midnight and DST tests before enabling.

Important frozen-contract constraint: activity is a complete day replacement, not a
per-record ingestion API. A Health Connect write CAN replace an existing manual day;
manual cannot subsequently overwrite a Health Connect day (SOURCE_CONFLICT409).
Older sync timestamps return STALE_SYNC409; equal timestamp with different values
returns SYNC_CONFLICT409. Therefore require a preview and explicit consent before
replacing manual values; no automatic sync is currently safe to enable. Keep a stable
snapshot timestamp on a retry instead of manufacturing a newer sync time.

There is no server device-consent ledger/change-token ingestion contract. Native IDs
are client provenance, not trusted sensor attestation. Future consent/checkpoints must
be account-scoped, cleared or isolated on logout, and never upload one person's device
history to a different account without fresh explicit selection. Recheck session
generation and permissions before every read/upload, cancel active work on logout or
revocation, retain unknown upload outcomes for reconciliation, and never delete existing
manual/server records automatically when permission disappears. Changes/deletions from
the provider and restart-safe cursors remain unimplemented decisions.

## Verification boundary

On30 October, the existing native-focused command covering auth-session, auth-outbox,
Health Connect readiness and nutrition screens passed **46tests in4suites** before
the four new camera cases. Re-running nutrition screens afterward passed **18tests**.
These scoped totals overlap; do not add46+18 or add them to the full collection.

Final suite totals are recorded by the coordinator in `phase6-release-readiness.md`.
Native-focused suites are subsets, not extra tests to add to the full Jest count.
Neither web rendering nor mocked CameraView/SecureStore establishes native build or
physical-device success. Final status: camera PARTIAL; SecureStore and deep links
LOCALLY TESTED ONLY; Health Connect BLOCKED.
