# Phase 5 auth, onboarding and profile implementation

29 October 2026. Source implementation and local automated evidence; this is not
a claim of real inbox delivery, native SecureStore acceptance or Samsung device success.

## Implemented flows and endpoints

| Flow | Actual API / behavior |
| --- | --- |
| Register / verify / recovery | Existing first-party register, resend, verify, forgot/reset routes retained. Generic202 copy stays explicit about unconfirmed eligibility/delivery. Registration carries the entered email into verification. Email actions still require explicit confirmation. A synchronous ref latch prevents same-tick duplicate submissions. |
| Initial setup routing | `GET /me` then authoritative `GET /onboarding`; full nullable profile/goal shapes and relevant authority consistency are checked. No goal-history scan is used for navigation. |
| Guided onboarding | Name, optional DOB, height, activity, preferred kg/lb and IANA timezone; current/target weights converted to metric; all four goal labels; public maintenance and complete macro previews; presets/custom deficit; review, back and progress. Labels never alter the backend formula. |
| Confirm setup | Profile is created only if absent. `POST /goals` uses a retained UUID and exact saved body. Re-fetches `/onboarding` and enters Dashboard only after server completion confirmation. |
| Pending goals | Existing legacy markers retain positive-read reconciliation. Version2 markers retain body/UUID across restart and may explicitly replay the same receipt; different input stays blocked. Account-specific SecureStore operations are serialized and caller-bounded without allowing a late native write to overtake cleanup. |
| Profile | Complete `PUT /profile` retains unchanged fields, nullable DOB, unit, timezone and the original metric weight when its lb display was untouched. Explicit weight changes obtain a server macro preview and confirmation warning before replacement. Profile weight can create a backend goal revision; the client does not independently calculate it. |
| Goal history / revisions | Paged `GET /goals`, server preview, `PATCH /goals/{goal_id}` calculation revision, returned ID retained; confirmed active/paused/completed status changes. Blank optional step target clears it using supported null semantics. |
| Account security | Runtime-validated `GET /auth/sessions`, password visibility, confirmed password change, session revoke, logout and logout-all. Current-session deletion clears local auth only after server success. Existing session controller, rotation markers, refresh serialization and generation guards are unchanged. |
| Data erasure | Accurate information that no self-service deletion endpoint is available; no decorative deletion action. |

## Local checks

Final focused verification: **83 tests passed across six suites**. Whole-app TypeScript
and scoped ESLint passed after the fixes described below. Coordinator verification
of the complete application remains the final gate. Focused command:

```powershell
cd apps/mobile
npm test -- --runTestsByPath src/lib/onboarding.test.ts src/lib/profile-values.test.ts src/lib/pending-goal.test.ts src/screens/flow.test.tsx src/screens/profile-workflows.test.tsx src/screens/auth-outbox.test.tsx --silent
```

The focused group covers existing auth/foundation regressions plus authoritative
onboarding, exact receipt replay, legacy marker blocking, native-storage late-write
ordering, profile optional-field preservation, unchanged lb/metric snapshots,
server weight preview, returned revision identity, malformed sessions and confirmed
revocation. Native components/storage/HTTP are explicitly controlled test boundaries
in these component tests; they do not replace the coordinator's real local backend test.

The resumed verification reproduced and fixed two receipt defects: changed daily steps
could silently replay an earlier version2 request, and a malformed successful goal
response could clear its receipt. Version2 recovery now checks the full requested
steps/status identity, validates retained metadata and validates the returned goal
before clearing the encrypted marker. Existing legacy markers still require positive
matching reads. Regression tests also cover malformed profile success, first-step
DOB-only navigation protection, inline goal-draft discard confirmation and prevention
of another history action replacing an open draft. Failed profile/account confirmations
close their sheets so error and reconciliation controls are accessible.

Profile summaries and goal review respect the preferred weight unit; unchanged values
retain their canonical metric strings. Onboarding retains an existing daily steps
target when creating the reviewed goal. Preview actions are synchronously latched and
show loading while actual server calculations run. Goal patch tests assert only the
frozen editable request fields; read-only creation/calculation metadata is not sent.

## Remaining acceptance limits

- Profile/goal drafts are bounded to their mounted form. Route-removal guards retain
  them during failed writes; explicit cancellation/process termination discards them.
  No automatic offline health-data queue is introduced. The pending goal receipt is
  the deliberate encrypted exception needed for safe create recovery.
- Unknown unkeyed profile/goal writes require an explicit authenticated refresh and
  review. The frozen profile replacement API has no goal-ID precondition, so another
  device can change an active goal between preview and commit; the refreshed saved
  server result remains authoritative.
- Real email sending, native picker rendering, accessibility/font scaling and physical
  device acceptance require their separate deployment/build/device gates.
- Goal calculations keep backend minimum-calorie and macro validation; a goal label
  such as muscle gain does not introduce a client-calculated surplus.

SDK58 navigation behavior was checked against the [versioned Expo reference](https://docs.expo.dev/versions/v58.0.0/)
and [official removal-prevention API](https://docs.expo.dev/router/advanced/prevent-screen-removal/).
