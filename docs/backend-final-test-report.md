# Phase 4 backend verification and freeze report

Review date: 28 October 2026. Branch: `codex/first-party-auth`.
Starting verified commit: `0571f603fc64f84a92c948ef3696db326683c8cc`.
The final local commit is identified in the completion message; no push or merge is authorized.

**Local backend business code is complete; API contracts are frozen and the frontend
handoff is ready.** This is not deployed/production acceptance. Results below are
actual returned results. An interrupted process without its final report is not a pass.

The complete final inventory has **424 distinct passing backend cases:348 unit and
76 real PostgreSQL**, zero unresolved failures/errors/skips. Compared with the324-case
Phase3 baseline, this adds100 cases (81unit/19PG). Existing Day1–3 and authentication
test files remain included; no tests were dropped to obtain a passing result.

## Actual specialist execution

Four concurrent agents were available, including the coordinator. Work ran in waves
of at most three specialists plus the coordinator, with explicit file ownership.

| Agent | Actual scope and returned evidence |
| --- | --- |
| `/root/phase4_nutrition` — A | Audited before editing; implemented provider pagination/barcode/validation, recipes, quantity preview, meal ranges and retry wrappers. 96 focused unit cases passed. Authored four PG cases, not executed by this agent. |
| `/root/phase4_fitness` — B | Exercise/plan/session/tracking audit, active-session protection, filtering, positive duration, activity list/delete and retry wrappers. 36 focused unit cases passed. Authored six PG cases; coordinator executes them. |
| `/root/phase4_auth_database` — C | Derived onboarding, weight CRUD/provenance, goal history/retry protection, additive 0007 and readiness checks. Follow-up fixed stale weight confirmation. Final 46 focused unit cases passed; authored five PG cases, not executed by this agent. |
| `/root/phase4_insights` — D | Historical macro analytics/dashboard goal context and Health Connect handoff. Seven unit cases passed; authored two PG cases. Extra final documentation-review attempt hit a usage limit and produced no review result; coordinator reviews documentation directly. |
| `/root/phase4_contracts_release` — E | Actual OpenAPI/TS regeneration, endpoint inventory, frontend handoff and dependency audits/signatures. Ten contract cases passed; all contract tooling checks passed. |
| `/root/phase4_adversarial_review` | Read-only independent review found three actionable P2 issues, all addressed. Follow-up found no remaining actionable issues in those fixes or the twelve retry operations. No tests or live calls by this reviewer. |
| Coordinator | Initial matrix before implementation, shared receipt helper, remaining retry wrappers, input/resource bounds, dashboard consistency fix, full verification, documentation integration and final local commit. |

Focused agent counts overlap the complete suite and are never added together.

## Confirmed gaps implemented

The [initial feature matrix](backend-final-feature-matrix.md) was written before code
changes. Existing architecture and working endpoints were reused. Changes complete
derived onboarding; weight correction/deletion/latest/ranges/provenance; retry-safe
creates; active-session lookup/protection; activity history/deletion; paginated foods
and recipes; OFF barcode lookup; server quantity preview; meal ranges; historical
macro adherence and dashboard target-weight context. Full consumption contracts are
in the [frontend handoff](frontend-api-handoff.md).

OpenAPI contains **67 paths / 91 operations**. Seven new paths: `/onboarding`,
`/weight-logs/latest`, `/weight-logs/{weight_id}`, `/foods/barcode/{barcode}`,
`/foods/{food_id}/nutrition`, `/workout-sessions/active`, `/activity`. Existing paths
gain collection methods, filters and optional UUID retry headers. Generated inventory
lists every method, request/response type, authorization and parameter.
Compared directly with the starting committed schema:60paths/80operations become
67paths/91operations, **11 operations added and none removed**. Additions are GET
onboarding, recipe collection, barcode, quantity preview, active workout, activity
history, latest weight and weight detail; PATCH/DELETE weight detail; DELETE daily
activity. Existing food/meal/workout/weight lists gain filters and retry headers
apply to the twelve documented POST operations.

Migration `0007` adds only `request_receipts` and weight `source`/`external_id` with
constraints. Code metadata now has 28 tables. Migrations 0005/0006, nutrition formulas,
historical snapshots, internal UUID ownership, existing auth architecture, Render/EAS
identity and lockfiles are retained. No existing application database migration occurs.

## Security/correctness review and regression evidence

1. New weight editing exposed stale preview confirmation. Confirmation now requires
   `expected_weight_kg` as well as `expected_goal_id`, checks the owned weight under
   a row lock and rejects changed values with `WEIGHT_CHANGED`409. Missing expected
   weight is422. There was no existing mobile apply-goal caller; OpenAPI, examples
   and every test caller were updated. This intentional tightening prevents applying
   a different calculation from the user's reviewed preview.
2. Untrusted USDA `dataType` could raise TypeError. A type guard safely rejects the
   malformed record. Provider JSON has a streamed 2MiB decoded-body limit and explicit
   nesting limit; parser recursion is sanitized. Deep JSON did not raise on this
   interpreter, so an explicit structural bound was added and tested rather than
   falsely claiming reproduction of that parser failure.
3. Newly displayed goal context could differ from nutrition budgets under concurrent
   goal revision. Both now reuse the same resolved historical goal. Regression checks
   that a second, possibly different lookup is not performed.
4. Slow provider retries held the provider mutex and could queue callers. Cache refresh
   now fails fast under contention, retaining safe stale fallback and bounded retries.
5. Daily nutrition hydration was unbounded. It now fetches at most101 meals and rejects
   more than100 before calculating a partial total. Up to100 items per API meal remain;
   complete history is still accessible through pagination. Analytics range/query bounds
   and batched query-count regressions remain.
6. A preserved nested-resource test caught lifecycle checks preceding set-parent
   validation for a completed workout. Missing/mismatched nested sets now return404
   before lifecycle rejection; a valid set in an immutable workout still returns409.
   The original isolation assertions remain unchanged, with extra unit regressions.
7. Pytest failure introspection printed a synthetic generated bearer token. The PG
   runner now redacts generated compact JWTs/bearer values as well as configured
   secrets, both in console output and parsed JUnit text/attributes. The retained
   failed report was sanitized without changing its15-pass/1-failure outcome.

The retry helper scopes receipts by internal user/operation/UUID and binds parent paths
for nested operations. Resource plus receipt share the normal request transaction;
no independent commit. Changed payload409, deleted original409, concurrent replays
one resource. A failed-commit PG regression now checks both row and receipt rollback
and safe subsequent reuse of the same key. No automatic mobile write retries were added.

No confirmed critical/high backend security defect was found in the reviewed source.
That is a scoped review conclusion, not a universal security certification.

## Recorded verification

All application Python execution uses `python -m uv run --no-sync`. Python3.12.15,
SQLAlchemy2.1.6 and `HAS_CYEXTENSION=False` were verified; no ordinary project sync,
interpreter replacement or Windows Application Control change occurred.

| Check | Actual result |
| --- | --- |
| Complete final unit suite | **348 passed**, 76 integration cases deselected, 12.93s; `.pytest_cache/phase4-final-units.xml` |
| All new PostgreSQL cases | **19 passed**,386.01s; `.pytest_cache/phase4-verified-new-postgres.xml`; generated database removed |
| Original PostgreSQL outbox cases | **10 passed**,202.34s; `.pytest_cache/phase4-verified-outbox.xml`; generated database removed |
| Original PostgreSQL auth and actual managed lifecycle | **13 passed**,317.17s; `.pytest_cache/phase4-verified-auth-managed.xml`; generated database removed |
| Final original tracking plus affected new fitness cases | **22 passed**,449.59s; `.pytest_cache/phase4-verified-final-fitness-tracking.xml`; generated database removed; six new fitness cases overlap the19-case batch and are counted once |
| Original core nutrition/database cases | 17 passed/1 DNS setup error,363.58s; retained `.pytest_cache/phase4-verified-core.xml`; blocked case rerun **1 passed**,23.39s in `phase4-verified-core-dns-retry.xml`; both generated databases removed |
| Ruff lint, entire API repository | PASS |
| Ruff formatting | PASS, 128 files already formatted |
| OpenAPI export/check | PASS |
| Endpoint inventory export/check | PASS, 67 paths /91 operations |
| TS contract generation/check/typecheck | PASS |
| Mobile TypeScript and ESLint | PASS |
| Complete mobile suite after wrapper changes | **142 passed**, 11 suites, 13.957s; `.expo/phase4-mobile-final-verified.json` |
| Expo Doctor | PASS, **20/20**; sandbox DNS failure retried with authorized network access |
| Static Render/EAS configuration safeguards | PASS |
| Configured-secret scan | PASS, 293 candidate/bundle files,29 existing bundle files,0 configured-credential matches at final checkpoint |
| Dependency audits | Python77 packages:0 known findings; contract npm:0; mobile **3 high+13 low**,0 critical/moderate; npm audit exit1 accurately retained |
| Registry signatures/attestations | 1307 signatures /315 attestations verified |

The existing Android export scanned above predates this phase; no new APK or device
acceptance is implied. The [dependency report](phase4-dependency-audit.md) records
reachable Zod/deepmerge tooling risks, lack of compatible remediation and the review
deadline before build/by2November2026. No forced fix or lockfile change was used.

Final reconciliation is saved in ignored `.pytest_cache/phase4-final-summary.json`.
It checks the current complete pytest collection by module/function and parameter
cardinality (some test IDs contain generated UUIDs), then requires a passing latest
result for every case. Six repeated fitness cases and the isolated DNS retry are
counted once. Earlier failed/error artifacts remain intact; only generated credentials
were redacted. No source changes followed the successful affected-case reruns.

## Failed/interrupted evidence retained

Ignored artifacts remain under `services/api/.pytest_cache` or `apps/mobile/.expo`.

- Initial unit collection failed on duplicate test basenames; the new unit file was
  renamed, with no cache deletion or skipped coverage.
- Initial targeted PG batch:9 passed/1 failed,203.17s; its generated database was
  removed. A new test incorrectly assumed fixed trailing Decimal zeros. It now checks
  string type plus exact Decimal value, matching the established API contract.
- A unit run passed339/failed1 on the historical 60-path assertion; it was updated to
  67 with explicit new-path coverage. The generated artifact still must match source.
- Tracking preservation batch:15 passed/1 failed,341.83s. The nested completed-parent
  result was409 instead of404. Authorization ordering was corrected, not the expected
  isolation outcome. Its final rerun and full fitness/core coverage are recorded above.
- Core batch:17 passed/1 setup error from transient DNS resolution,363.58s. The single
  blocked case passed in a fresh disposable database without changing application
  code or assertions. Subsequent reconciliation retains the failed setup history.
- Initial parser-nesting fixtures did not raise on this interpreter. Explicit JSON
  complexity rejection plus safe parser-error handling now have passing regressions.
- The first long PG process was interrupted and has no final XML/cleanup report. No
  project test process remained on resumption. It is not counted as passed or cleaned;
  do not delete old generated-name databases by prefix without ownership evidence.
- Sandbox uv cache/DNS failures were retried with authorized access. No WDAC failure
  was observed. Initial lint formatting findings were corrected, not suppressed.

## Reproducible commands and acceptance limits

From `services/api`:

```powershell
python -m uv run --no-sync pytest -q -m 'not integration'
python -m uv run --no-sync python -m scripts.run_postgres_tests tests/integration -o junit_family=xunit1
python -m uv run --no-sync ruff check .
python -m uv run --no-sync ruff format --check .
python -m uv run --no-sync python -m scripts.export_openapi --check
python -m uv run --no-sync python -m scripts.export_endpoint_inventory --check
```

The coordinator may execute PG files in separate recorded batches; every collected
integration case must have one final passing result, without double-counting retries.
Each runner creates and removes only its own fresh disposable database. All test
schemas are generated in that database. This never targets existing application data.

Required deliverables: [feature matrix](backend-final-feature-matrix.md),
[architecture](backend-final-architecture.md), [frontend handoff](frontend-api-handoff.md),
this report and [remaining limitations](backend-remaining-limitations.md). Live
deployment/migration/email/APK/phone tests and paid services were not authorized.
No push/merge, live environment change, phone reset, legacy deletion or signing change
was performed. All local freeze criteria are met. Deployment and production
acceptance remain blocked by the separate limitations below.

Read-only application inventory reconfirmed migration revision **0004**. Updated
readiness correctly returns a nonzero blocked result: expected0007/auth tables not
present, mail/key-ring configuration unavailable and worker disabled. Local request
intake is configured enabled; the prepared Render blueprint remains disabled. A local
configuration result is not evidence of actual Render settings or delivery.

Final read-only inventory also found **three generated-name databases** still present.
Two predate this phase; the interrupted run may account for the additional database.
Ownership/cleanup cannot be proved from a name alone, so no prefix cleanup was done.
All completed final test runners reported removal of only their own generated DB.

## Backend freeze decision

| Gate | Final local status |
| --- | --- |
| Required MVP business endpoints, lifecycles and ownership | COMPLETE |
| Mandatory nutrition formulas and historical snapshots | PRESERVED |
| First-party authentication/outbox code and regressions | COMPLETE |
| Additive migration0007; 0004→latest roundtrip and metadata checks | READY; not applied to application DB |
| OpenAPI/TypeScript/current endpoint inventory | FROZEN,67paths/91operations |
| Five required documents and consumption examples | READY |
| Entire current backend collection, including real PostgreSQL | PASS,424 distinct cases |
| Backend code readiness for frontend implementation | FRONTEND-READY locally |
| Render deployment /real email /Android acceptance | NOT STARTED /NOT VERIFIED /NOT VERIFIED |
| Verified Indian catalog | BLOCKED; measured custom foods/recipes are the supported fallback |
| Public production acceptance | BLOCKED pending external/operational/security-tooling gates |

The [remaining limitations](backend-remaining-limitations.md) preserve the mail
availability, key/sender setup, legacy enrollment, data licensing, retention,
tooling audit and real-device gates. No external blocker is marked resolved.
