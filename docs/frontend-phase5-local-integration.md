# Phase 5 real local HTTP integration

29 October 2026. The actual mobile `createApiClient` and `createAuthSession`
source runs in Node against the frozen local FastAPI application over loopback HTTP.
This is a client/backend integration test, distinct from mocked component tests and
from Android UI/device acceptance.

## Isolation and substituted boundaries

The runner creates one new UUID-named `provia_mobile_…` PostgreSQL database using the
existing development direct connection. It applies the existing incremental Alembic
migrations through **0007** only to that database. Its `finally` block removes only
the exact database created by that invocation. The existing application database,
other test databases, production records and credentials are not changed.

FastAPI uses newly generated test signing and encryption keys. It binds to
`127.0.0.1` on an ephemeral port, with request/body logging disabled. Actual generated
session credentials are sent only through the real authenticated HTTP requests; they
are not printed, written as artifacts or passed on command lines.

Two boundaries are explicit substitutes:

- **External email:** the real durable outbox and `EmailWorker` execute, but a controlled
  in-memory delivery sink receives the verification action. The runner passes the action
  to the Node test over a private process pipe. No public token/debug endpoint exists;
  no SMTP or real inbox delivery is exercised or claimed.
- **Native credential storage:** the real session controller uses an in-memory
  `AuthStorage` adapter. Restore/refresh rotation and logout logic execute against the
  real server. This does not prove Android SecureStore, keystore or process lifecycle
  behavior; those remain native/device tests.

HTTP handlers, fetch replies, account identity, business services, database queries,
meal snapshots, goals, workout records and tracking totals are **not mocked**. A thin
transport observer calls real `fetch` and records only numeric HTTP status counts.
Food search explicitly selects the local source; external food providers are absent.
All fitness/account data in the run is synthetic and confined to the generated database.

## Workflows exercised

The complete strengthened flow has 30 checkpoints:

1. Generic registration response, actual202, no returned action token.
2. Controlled supervised outbox delivery.
3. Explicit verification over real HTTP.
4. Login through the real session controller.
5. Restore through actual refresh-token rotation.
6. Authoritative onboarding advances after complete profile replacement.
7. Server nutrition preview agrees with the saved goal; same receipt replays one UUID.
8. A paused zero-deficit maintenance goal survives a fresh PostgreSQL read without
   replacing the active goal.
9. Local authenticated food search returns actual results/empty data.
10. Custom food receipt, search and server quantity preview agree, including measured zero.
11. Meal creation replays the same UUID and saves server snapshots.
12. Nutrition dashboard retrieves actual meal totals.
13. Full item replacement recalculates; metadata-only editing preserves item identities
    and numeric snapshots, including null/zero distinctions.
14. Deletion returns204 and the deleted entry becomes404.
15. An immutable measured recipe and its zero-nutrient values validate on fresh reads.
16. Custom exercise and a seven-day plan with training/rest days persist.
17. Active session restores its real plan snapshot; a second start conflicts409.
18. Set creation/editing stores actual repetitions and load.
19. Completion removes active state; terminal-session set creation conflicts409.
20. History and actual personal records reflect the completed set.
21. Weight logging does not silently rewrite profile or active goal.
22. Explicit weight-goal preview/application creates a new revision; a stale goal conflicts409.
23. Dated water target and replay-safe intake yield actual totals.
24. Manual activity replaces a complete day while preserving unknown fields.
25. An offset-aware sleep interval yields eight actual hours.
26. Unified dashboard and progress agree with saved nutrition, weight, water, activity,
    sleep and workout records.
27. Profile name/unit preference replacement retains DOB and unchanged canonical weight,
    preserving the existing goal revision.
28. Actual controller logout clears its test native-storage adapter.
29. Anonymous and revoked sessions receive401 for protected data.
30. A separately registered real test account receives404 for another account's owned
    food, meal, plan, session and weight records.

The strengthened driver passes the actual frontend runtime validators to client reads
and writes for nutrition, recipes, workouts, tracking, profiles and progress. No duplicate
frontend response DTO is maintained by the harness. TypeScript transpilation is only
the Node execution bridge for existing source; the mobile project is typechecked separately.

## Contract issue caught and corrected

PostgreSQL `NUMERIC` values can return finite exponent strings such as `0E-8` after a
fresh read. Nutrition and goal runtime checks originally rejected these valid values.
Two new focused regressions failed before the frontend-only correction and passed
after accepting finite decimal exponent notation. Nonfinite values (`NaN`, `Infinity`
and overflowing exponents) remain rejected. Nutrition calculations and backend output
formats are unchanged. The actual zero-fiber and zero-deficit integration fixtures
exercise the real database representation, beyond synthetic JSON shape tests.

PostgreSQL may also add trailing zeroes to decimal strings between write and read.
The controlled-fixture snapshot assertions compare numeric meaning while still requiring
the same item/food UUIDs and exact null preservation; they do not mistake a scale-only
serialization difference for a changed snapshot.

## Commands and result

Run from `services/api`:

```powershell
python -m uv run --no-sync python ../../apps/mobile/scripts/phase5-local-integration.py
python -m uv run --no-sync ruff check ../../apps/mobile/scripts/phase5-local-integration.py
python -m uv run --no-sync ruff format --check ../../apps/mobile/scripts/phase5-local-integration.py
```

Run from `apps/mobile`:

```powershell
node --check scripts/phase5-local-integration.cjs
npx --no-install eslint scripts/phase5-local-integration.cjs
```

Verified final strengthened run: **30/30 checkpoints passed across 70 actual HTTP
requests**, migration0007 verified, and the exact newly generated database was removed.
Observed statuses: **200×37, 201×18, 202×2, 204×1, 401×3, 404×6 and 409×3**. The negative
statuses are asserted anonymous/revoked-session, ownership/deletion and state/stale-goal
checks, rather than unexplained failures. Python Ruff lint/format, CJS syntax and scoped
ESLint pass. The two new numeric regressions pass within33 focused tests. The runner requires
an explicit completion event, at least27 checkpoints, successful process exit and owned
resource cleanup; a setup failure or partial run is not a pass.

No EAS build, deployment, live application migration, real email activation, phone
installation/data reset, camera test or Health Connect test is performed by this script.
