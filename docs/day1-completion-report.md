# PROVIA Day1 completion report

Verification date:2026-10-22. Work resumed in the existing repository. No frontend,
AI, or Day2 feature APIs were added. Existing local credentials were used without
copying their values into source or this report.

## Initial audit

At the updated brief, Tasks1–2 were committed and Tasks3–8 had substantial uncommitted
implementation. The initial schema, JWT verification, profile/goal APIs, food adapters,
meal snapshots, and isolated tests existed. Automatic nutrition formulas, dashboard,
curated catalog import, Clerk-specific checks, and actual service verification remained.

| Task | Initial classification | Evidence at audit |
| --- | --- | --- |
| 3 Database connection | Implemented but unverified | Lazy engine/session and health query existed; no live checks yet |
| 4 Models and migrations | Implemented but unverified |17 models and initial migration; no live migration evidence |
| 5 Authentication | Partially implemented | Signed-key tests existed; Clerk optional aud/azp and live checks remained |
| 6 Profiles and goals | Partially implemented | CRUD existed with draft manual targets; finalized formulas missing |
| 7 Nutrition and meals | Partially implemented | CRUD/snapshots/daily existed; dashboard and Indian catalog missing |
| 8 Integration verification | Partially implemented | Isolated tests passed; PostgreSQL tests skipped and live services unchecked |

## Changes and fixes

Implemented the shared Decimal target calculator, public preview endpoints, computed
goal persistence/versioned snapshots, profile-triggered recalculation, and authenticated
daily dashboard. Added Clerk optional-audience and authorized-party validation, pending
session rejection, and standard issuer JWKS derivation. Added curated-food attribution,
aliases/import validation, process-local provider caches, cooldowns, and429 handling.
Added migration0002 incrementally after0001, verified live database behavior, and added
real PostgreSQL regression coverage and safe verification runners.

Fixed Neon pooler rejection of startup options using transaction-local settings; invalid
OFF portions; the batch import list-unpacking error; unrelated profile edits replacing
goals; legacy goal activation bypassing calorie safeguards; and USDA's failing multi-type
search filter. Foundation-only requests now pass live. Updated documentation and env
examples without replacing the user's configured .env.

## Verification table

| Component | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Dependencies | PASS | `python -m uv sync`:85 resolved,82 checked | Python3.12.15 |
| Neon application connection | PASS | Actual health/db HTTP200 after SELECT1 | Pooled URL, SSL enforced |
| Neon direct connection | PASS | SELECT1,18 tables including Alembic,20 foreign keys | Development identity checked before migrations |
| Migration history | PASS | `alembic current`:0002(head); `alembic check`:no upgrade operations |0001 initial then additive0002 applied |
| Migration roundtrip/metadata | PASS | Real PostgreSQL upgrade/downgrade/upgrade and metadata comparison | Only isolated test schema; app tables never dropped |
| Model constraints | PASS |17 model compilation tests, live FK checks, active-goal/nutrient constraint tests | No claim of exhaustive business-rule coverage |
| Clerk deterministic authentication | PASS | Local RSA-signed valid/invalid/expired/wrong-issuer/wrong-audience, azp/pending tests | No authentication bypass in application |
| Clerk JWKS reachability | PASS | Actual HTTP200 with RSA keys | Does not prove session authentication |
| Clerk live session end-to-end | BLOCKED | No real session token supplied | Audience/azp config must match actual client tokens |
| Profiles/goals/history | PASS | Real PostgreSQL CRUD, active-goal uniqueness, cross-user denial, revisions/profile edits | Legacy activation needs calculation inputs |
| Exact nutrition formulas | PASS |97/85/500 reference and invalid-input tests |2328 maintenance,1828 daily,161.5 protein,67.9 fat,25.592 fiber,142.725 carbs |
| USDA live adapter | PASS | Actual search returned9 normalized foods | Foundation filter; adapter call, not real-Clerk authenticated endpoint test |
| USDA endpoint persistence | PASS | Controlled provider result imported through authenticated API on PostgreSQL | Uses signed local test identity |
| Open Food Facts normalization/failure handling | PASS | Mocked gram/volume/portion/timeout/HTTP/429 tests | No invented nutrients or density |
| Open Food Facts live search | FAIL | Repeated actual HTTP503 responses | Current environment could not verify live search; see service-verification.json |
| Indian catalog architecture | PASS | PostgreSQL import/dedup/alias search and validation tests | Metadata-only fixtures; no fabricated nutrition records |
| Licensed Indian food coverage | BLOCKED | No verified licensed dataset supplied | Bundled JSON array is empty; importer/custom foods available |
| Meal tracking | PASS | Real CRUD, portion conversion, atomic failure, snapshot preservation, ownership tests | Updates/delete reflected in totals |
| Daily dashboard | PASS | Real no-goal/no-meal, multiple meals,300kcal deduction, edits/delete, negative budget and isolation tests | Shared aggregation with daily summary |
| Timezones/unknown nutrients | PASS | Local day boundaries, DST tests, null propagation; live midnight-boundary daily test | UTC before profile |
| Full test suite | PASS |120 passed,0 failed,0 skipped in124.29s |111 isolated tests plus9 PostgreSQL tests |
| Final USDA regression checks | PASS |24 nutrition tests passed after filter correction | These overlap the120 tests; do not add counts |
| Ruff | PASS | `ruff check .`:all passed; `ruff format --check .`:62 formatted | Final checks after edits |
| Secret and error handling checks | PASS |0 local-secret matches in80 Git candidate files; .env ignored; sanitization/isolation tests | Review scope, not a penetration-test certification |
| R2 storage | NOT RUN | Config present, no Day1 storage integration | No buckets/objects changed |

## Database and test isolation

The configured environment was development. Pooled/direct database identity matched;
the development database had no application tables before the initial migration.
No user data was deleted. Development now has17 application tables plus alembic_version.
The runner created a fresh randomly named disposable database, ran tests in per-test
schemas, and removed only its generated database in finally. The application's .env
TEST_DATABASE_URL remains unnecessary for this runner. Normal pytest skips integration
tests without a separately configured disposable test database.

Commands actually run from services/api included:

```powershell
python -m uv sync
python -m uv run python -m scripts.run_postgres_tests
python -m uv run pytest tests/test_nutrition.py -v
python -m uv run ruff check .
python -m uv run ruff format --check .
python -m uv run alembic upgrade head
python -m uv run alembic current
python -m uv run alembic check
python -m uv run python -m scripts.verify_services
```

The test runner invokes the equivalent of `uv run pytest -v` with generated disposable
database variables and captured/redacted output. It ran the entire120-test suite, not
only unit tests. A deliberate temporary JWT algorithm-check mutation was detected by
the signed-token test during review; the original logic was restored before passing runs.

## Security review and operational limits

Independent code review found the import, profile-edit and legacy-activation defects
described above; all were fixed with regression tests. Secret scanning compared actual
local credential values and database passwords against Git candidate content in memory,
without printing values. .env is ignored and untracked. SQL values use SQLAlchemy binding;
test-only schema/database names are generated UUIDs, checked before cleanup. External
provider destinations are fixed, JWKS comes only from trusted config, and raw requests,
bearer tokens, API keys and exception text are excluded from application logs/responses.

No known unresolved cross-user access or JWT-verification defect was found in this
review. This is not production certification. Process-local request cooldowns are not
distributed rate limits. Cached catalog rows are not automatically refreshed. Goal
history is retained, but historical dashboard dates compare against the current active
goal. Weight logging does not implicitly update the profile. Legacy/manual target input
contracts are replaced by computed goals as required by the updated brief.

## Remaining work and next steps

Real Clerk session authentication is blocked pending an actual user session token;
JWKS access alone does not verify audience/azp alignment with the eventual client.
Open Food Facts live search failed with503 and should be rechecked when available.
Indian food coverage awaits licensed, verified records with source attribution and
food-specific portion weights. R2 storage, workout/activity/sleep/water APIs, frontend
and AI remain outside this Day1 implementation; their absence is not silently counted
as verified. Do not proceed to Day2 until review is complete.

To run the backend with the existing local .env:

```powershell
cd services/api
python -m uv sync --locked
python -m uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --no-access-log
```

Open http://127.0.0.1:8000/docs. Set trusted authorized parties for the real frontend;
leave AUTH_AUDIENCE empty only if the chosen Clerk token format has no aud. Standard
Clerk development JWKS is derived automatically; custom domains require an explicit URL.
Use the report's blockers to guide the next verification pass, then review the API
contract and formula limitations before connecting a client.

PROVIA DAY 1 — TASKS 3–8 COMPLETED AND VERIFIED TO THE EXTENT POSSIBLE. READY FOR REVIEW.
