# Phase 5 tracking implementation notes

29 October 2026. This is a scoped source/test handoff, not Android device acceptance.
The backend, migrations, credentials, deployment and application data were not changed.

## Implemented manual flows

| Area | Screens and actual API integration |
| --- | --- |
| Tracking overview | Profile zone/unit from `GET /onboarding`; actual measurements and daily signals from `GET /dashboard/today`. Missing measurements/activity/sleep remain unknown. |
| Weight | Paged/date-filtered `GET /weight-logs`, `GET /weight-logs/latest`, detail GET, receipt-keyed POST, PATCH and confirmed DELETE. Three-decimal kg/lb conversion; untouched rounded lb values preserve original kilograms during edits. Only observed measurements appear on the interactive history-page chart. |
| Goal application | Explicit `POST /weight-logs/{weight_id}/goal-preview`, display server calories and all four macro targets, then confirmed receipt-keyed `/apply-goal` with both `expected_goal_id` and `expected_weight_kg`. `GOAL_CHANGED`/`WEIGHT_CHANGED` discard the preview and require a new review. Logging alone never applies a goal. |
| Water | Dated `GET /water/dashboard`, range-paged `GET /water-logs`; receipt-keyed POST, PATCH and confirmed DELETE. Presets fill editable values without saving. Confirmed `PUT /water/target` retains an explicit effective date. No nonexistent water-detail GET is used. No target is assumed. |
| Activity | Actual dated `GET /activity/daily`, paged `GET /activity`, `GET /activity/summary`, explicitly reviewed full-day PUT and confirmed DELETE. Optional blanks are null; known zero is preserved. Imported days cannot be overwritten through the manual editor. Active calories do not alter food targets. |
| Sleep | Paged/date-filtered collection, actual detail, receipt-keyed POST, PATCH and confirmed DELETE; `/sleep/summary` observed-point chart plus accessible daily values. Offset-aware overnight intervals use elapsed duration and the profile's wake-up date. Stage intervals are displayed only when supplied; note/time edits omit stages so they are preserved. |

Nested routes live in `apps/mobile/src/app/tracking/`; feature screens and runtime
checks live in `apps/mobile/src/screens/tracking/`. The coordinator owns protected
root navigation and tab wiring. There is no duplicate tracking index route.

All mutations use the shared ref-latched mutation controller. Unknown creates retain
the original callback/body and UUID for an explicit retry; PATCH/PUT/DELETE ask the
user to refresh and reconcile. `usePreventRemove` protects dirty, pending and uncertain
forms against accidental removal. Account-bound API instances remain responsible for
preventing writes after an account change. Detailed record reads and onboarding use
`cacheMs: 0`; refresh invalidates the account read cache.

## Health Connect: blocked native integration

The app contains **no Health Connect native adapter**. Its readiness screen reports
device availability as not checked, permissions not requested, synchronization disabled
and no successful sync. It performs no native reads or backend uploads and offers
working manual tracking. The account/type/consent boundary fails closed for this build.

The [library's official guide](https://matinzd.github.io/react-native-health-connect/docs/get-started/)
documents an Expo config plugin and requires a custom native build. The prior source
audit found library 4.1.3's example on Expo 57 / React Native 0.86.2; this app is SDK 58 /
React Native 0.88, whose native compatibility remains unverified. The prior local
tooling audit found no Android SDK, adb, Gradle or suitable JDK. No replacement native
package was installed. A native compilation and Samsung A35 permission/read/revocation
test are required before enabling the adapter.

[Android's integration guide](https://developer.android.com/health-and-fitness/health-connect/get-started)
requires runtime availability/permission checks, and distinguishes SDK support from
actual device Health Connect availability. This implementation does not infer either
from `Platform.OS`. SDK 58 navigation guards follow the
[official removal-prevention API](https://docs.expo.dev/router/advanced/prevent-screen-removal/).

## Scoped verification and remaining limits

Targeted command:

```powershell
npm test -- --runTestsByPath src/screens/tracking/data.test.ts src/screens/tracking/screens.test.tsx src/lib/health-connect/readiness.test.ts --silent
npx eslint src/screens/tracking src/lib/health-connect src/app/tracking
```

Coverage includes timezone/date ranges, decimal conversion, explicit timestamps,
overnight/DST elapsed sleep, actual-stage bounds, unknown versus zero, reviewed goal
guards/stale 409, manual weight/water/activity/sleep requests, water target confirmation,
retained uncertain water retry, imported-day protection, sleep deletion confirmation,
and disabled Health Connect boundaries. Component HTTP responses and native controls
are test doubles; these are not real backend, camera, permission or device results.
Scoped result: **26 tests passed across three suites**. Scoped ESLint exited 0 with
no warnings. `npm run typecheck` also passed at handoff. The coordinator records
subsequent full-suite verification separately.

Remaining limits:

- No actual Health Connect permissions, reads, import queue, account-scoped stable-ID
  mapping or native sync are enabled. These are native implementation/verification
  work, not an external dataset blocker.
- Drafts and retained create callbacks are mounted-screen memory, protected against
  accidental navigation. OS process termination does not preserve a generic durable
  offline queue; do not claim cross-restart create replay.
- Android pickers cannot safely reinterpret a device-zone civil time as a different
  profile IANA zone. The form uses an explicit-offset ISO field for that case; matching
  zones and iOS also offer native pickers. No silent DST ambiguity is introduced.
- Existing stage intervals are preserved. A shortened sleep interval that excludes
  a recorded stage is rejected by the server; the UI does not silently delete stages.
- History is bounded to 20 entries per page and 366 calendar days per range. The weight
  chart labels its current-page scope; unified Progress owns full-range analytics.
- Rendered Android layout, large-font use, back gestures, actual device permissions
  and Samsung A35 behavior remain unverified until the coordinator's device checklist.
