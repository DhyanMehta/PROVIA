# Phase 5 workout implementation notes

29 October 2026. This is a source and local-test handoff, not Android device acceptance.

Implemented under `apps/mobile/src/screens/workouts/` with nested route adapters in
`apps/mobile/src/app/workouts/`. The coordinator owns root navigation and the tab.

- Workout home restores the account's actual active session, finds the actual active
  plan beyond the first page, selects today's schedule using the backend profile-zone
  date, and shows recent completed sessions in the server's returned summary range.
- Exercise browser supports text/category/muscle/equipment filters and bounded pages;
  details include instructions, metadata, legally supplied media or a truthful fallback.
  Own custom exercises support create/edit/archive. Archived history remains readable.
- Plans support nested weekly schedule creation and complete replacement editing,
  exercise selection/order/sets/reps/weight/rest, rest days, activation, duplication
  and confirmed deletion. Start-time plan snapshots remain read-only in session detail.
- Sessions support unplanned/planned starts, actual-active conflict recovery, persisted
  active restoration, actual set create/edit/delete, notes, elapsed time from persisted
  timestamps, completed/skipped/pending states, confirmed completion and cancellation.
  Terminal sessions expose no mutation actions. Pending sets prevent completion.
- Session history supports status/date filters and bounded pagination. Progress has
  seven/thirty/custom date ranges, actual completed-workout frequency points and an
  accessible value list, server duration/volume/consistency and observed personal records.
  Exercise history uses its actual server summary and qualifying sets.

## API integration

`GET /exercises`, `GET /exercises/{exercise_id}`, `POST /exercises/custom`,
`PATCH/DELETE /exercises/custom/{exercise_id}`;
`GET/POST /workout-plans`, `GET/PATCH/DELETE /workout-plans/{plan_id}`,
`POST /workout-plans/{plan_id}/duplicate`;
`GET/POST /workout-sessions`, `GET /workout-sessions/active`,
`GET/PATCH /workout-sessions/{session_id}`,
`POST /workout-sessions/{session_id}/sets`,
`PATCH/DELETE /workout-sessions/{session_id}/sets/{set_id}`,
`POST /workout-sessions/{session_id}/complete`;
`GET /workouts/progress`, `GET /workouts/exercises/{exercise_id}/history`.
Home additionally reads the unified dashboard and profile-zone presentation reads profile.
Paths are rooted at `/api/v1` in the actual typed client.

Generated DTOs remain authoritative. Feature validators reject malformed responses.
Creates with backend receipts use the shared retained exact-body/UUID mutation helper.
Set creation has no receipt support: uncertain results require a fresh session read
and a positive tuple/body comparison, without automatic POST replay. Active/session
reconciliation bypasses read cache. Uncertain edits/deletions require a successful
fresh authenticated read before the mutation guard resets. No backend, migration,
credentials, database, EAS or device changes were made by this specialist.

## Local evidence

Two focused Jest suites: **22 passing tests**. These are explicitly unit/component
tests with controlled transport/native UI doubles, not real PostgreSQL or device tests.
They cover nested schedule ordering/rest validation, observed elapsed time, terminal
and pending-set transitions, date bounds, snapshot validation, fresh reconciliation,
actual-active 409 handling, exact create replay, required custom-exercise category,
correct nested set PATCH shape, positive uncertain-set reconciliation and confirmed
completion/cancellation. Coordinator runs full application/backend integration checks.

Scoped ESLint passes. The final combined TypeScript check passes after the coordinator
resolved the shared tab icon color diagnostic found during the earlier check.

## Explicit limits and device checks

- The rest timer is local screen UI state and explicitly clears when leaving. The
  workout elapsed timer restores from the backend session, including after restart.
- Drafts remain in mounted editors after failures/refreshes. Plan editing explains
  that leaving discards unsaved changes; no durable offline write queue is claimed.
- Backend analytics bounds and pagination remain visible as errors/pages; no synthetic
  training history, calories, photos or estimated strength records are inserted.
- No native build, rendered visual inspection, physical gym-use test, TalkBack test,
  Samsung A35 test or true local HTTP/PostgreSQL integration was performed by this agent.
  Verify large text/keyboard behavior, rest timing through background/resume, deliberate
  network interruption, account switching, Android back behavior and all lifecycle
  confirmations on the device before claiming real-device success.
