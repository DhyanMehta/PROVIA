# Phase 7 Health Connect architecture — preparation only

30 October 2026. Starting source `f5aace0d84bafbfe9ed81f15f1d9c327ac3bd37f`.
**Authentication gate has not passed. No Health Connect integration changes are
authorized by this phase until its real email, app authentication, onboarding,
dashboard, native restoration and logout evidence exists.** This document records
read-only preparation, not a selected or verified implementation.

## Candidate and compatibility evidence

The candidate is `react-native-health-connect`. Its upstream main package metadata
currently identifies4.1.3, RN development dependency0.86.2 and Expo config-plugin
development dependency57.0.6. Those are upstream source facts, not a verified npm
release selection or an Expo58 compatibility guarantee. Nothing was installed.
See [upstream package metadata](https://raw.githubusercontent.com/matinzd/react-native-health-connect/main/package.json).

The project's actual dependencies remain Expo58.0.21/RN0.88.1. Existing build review
identifies JDK17, AGP9.2.1, Gradle9.4.1, compileSDK37/build-tools37.0.0,
targetSDK36/minSDK26 and NDK27.1.12297006. Compilation of the candidate against this
combination has not run. Do not downgrade the project to match a library example.

The library's v4 integration includes its Expo plugin and permission delegate;
the separate `expo-health-connect` plugin is deprecated and can cause duplicate
native classes. Expo Go cannot host this module. A new native binary is required.
See [library setup](https://matinzd.github.io/react-native-health-connect/docs/get-started/)
and [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/).

Android14+ supplies the framework provider; older supported devices need the
separate provider. Android's SDK supports API26 while provider use requires API28+.
Check actual availability/update requirements, not phone model alone. Current
Android guidance requires compileSDK36 and AGP8.9.1+ for connect-client1.1.0+;
this lower bound does not certify the wrapper/project pair. See
[Android setup](https://developer.android.com/health-and-fitness/health-connect/get-started).

## Proposed permission and reader boundary

After the authentication gate, request only selected read categories: READ_STEPS,
READ_WEIGHT and READ_SLEEP; add READ_DISTANCE/READ_ACTIVE_CALORIES_BURNED only when
those optional readers are included. Each uses `android.permission.health.` prefix.
No write, background or extended-history permission is proposed for the initial
foreground manual-sync scope. Configure actual permission rationale/privacy access
and provider visibility through supported config plugins, preserving package/EAS
identity and signing. Recheck permissions immediately before each read/upload.

Use complete profile-zone calendar-day aggregates for steps. Android aggregation
handles priority-based Activity/Sleep duplicate contributions; sparse/null results
are not permission-error zeroes. Do not sum overlapping phone/watch raw totals.
Use bounded initial seven-day foreground reads within granted history; honor the
platform's default30-day restriction and actual grant date. These decisions require
device verification. [Android aggregation](https://developer.android.com/health-and-fitness/health-connect/aggregate-data).

## Frozen PROVIA mapping and conflict rules

The following derive from `docs/health-connect-integration.md`, generated schemas,
`app/modules/tracking/service.py` and `app/modules/profiles/service.py`.

| Category | Existing API mapping | Required reconciliation |
| --- | --- | --- |
| Daily steps | PUT `/api/v1/activity/daily`: activity_date,steps,optional distance_m/active_minutes/activity_calories,source=health_connect,synced_at | Complete day replacement. Preserve original timestamp/body on retry. Older snapshot409 STALE_SYNC; equal timestamp/different data409 SYNC_CONFLICT. Imported data can replace a manual day; require explicit review/consent first. Manual cannot overwrite imported day409 SOURCE_CONFLICT. |
| Weight | POST `/api/v1/weight-logs`: weight_kg,recorded_at,source,external_id | Canonical kg and aware timestamp; stable provider metadata.id. Unchanged replay returns original; changed import409 SOURCE_RECORD_CONFLICT. Reconcile owned ID then explicit PATCH; never revise profile/goals automatically. |
| Sleep | POST `/api/v1/sleep-sessions`: start/end,source,external_id,optional actual stages | Stable ID; unchanged replay accepted, changed content409 SYNC_CONFLICT. Interval<=24h; own overlaps conflict. Select/reconcile overlapping origins before upload; do not fabricate stages or label elapsed time as asleep time. Summaries use local wake date. |

## Proposed coordinator and persistence

Separate adapter, consent manager, readers, pure mapping, account-scoped operation
ledger, serialized coordinator and visible status. User-triggered “Sync now” only.
Bind all operations to account/session generation and consent category. Abort on
logout/account switch, foreground cancellation or revocation; recheck before each
request. Do not let cached records cross accounts. A newly selected account requires
fresh explicit device-history selection. Do not log raw records or tokens.

Persist an operation's exact body and UUID receipt before a supported keyed create.
Keep provider-ID→PROVIA-ID mappings and deletion suppression scoped to account/type.
An uncertain upload requires a read/replay reconciliation, not a new create UUID.
Maintain day-level serialization and retain unknown/conflict states. Do not advance
future change checkpoints until complete pages and durable operations are retained.
[Android synchronization](https://developer.android.com/health-and-fitness/health-connect/sync-data).

The backend has no general import tombstones or optimistic multi-device merge.
An obsolete unkeyed upload can recreate a deleted record. A retained receipt returns
409 IDEMPOTENCY_RESOURCE_DELETED after deletion; local suppression is still needed
when fresh operations are considered. If ownership/correction/deletion history is
unknown, stop for explicit reconciliation rather than resurrect data. Permission
revocation stops reading/uploading and does not silently erase stored server records.

Only server-confirmed saved/reconciled records update last-success status. Refresh
tracking, dashboard and progress after confirmed persistence. Distinguish native
read, ready for upload, saved, replayed, conflict and failed. Absence/denial remains
unknown; optional denied metrics must not erase existing activity fields through a
partial full-day PUT. Existing manual tracking remains independent.

## Prerequisites before implementation

1. Pass and document the real authentication completion gate.
2. Establish compatible deployed backend/schema and approved real email/inbox flow.
3. Obtain an approved working native toolchain/build and accessible Android target.
4. Pin/review a published candidate version, plugin output and native compile result.
5. Validate permission/availability, profile-zone/DST, source overlap, deletion,
   uncertain upload, account cancellation and privacy behavior using actual native tests.
6. Obtain separate approval for cloud builds/installations/live operations when needed.
