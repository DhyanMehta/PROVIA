# PROVIA Day 1 final review

Verified on 2026-10-22 in the existing repository, on branch `main`. Baseline was clean
at `599bccb`, following `19d0085` and `79b920d`. No restart, frontend, or Day 2 work.

## Development readiness reassessment — 2026-10-23

Repository review at `cca07df` found no technical dependency requiring either remaining
external item to be resolved before implementing the Day 2 backend modules. This
reassessment separates backend development readiness from external integration and
production readiness; it does not resolve or waive either outstanding verification item.

| Readiness area | Status | Scope / condition |
| --- | --- | --- |
| Core backend implementation | PASS | Existing evidence: 155 passing tests, including 17 PostgreSQL integration tests; migration0003 and Ruff verified |
| External integration readiness | PARTIALLY BLOCKED | Real Clerk session verification and verified Indian nutrition data remain outstanding |
| Day 2 backend development readiness | YES | Workouts, water, daily activity, sleep and progress analytics can be implemented and tested using the existing foundation |
| Frontend authentication production readiness | BLOCKED | Until real Clerk session verification with an actual authenticated client |
| Indian food catalog coverage | BLOCKED | Until verified, legally reusable data is available and approved for import |

### Technical dependency assessment

The current `services/api/app/db/models.py` already defines Exercise, WorkoutPlan,
WorkoutPlanDay, PlannedExercise, WorkoutSession, WorkoutSet, WaterLog, DailyActivity
and SleepSession. Their foreign keys refer to users and workout/exercise records,
not the Indian food catalog or external food APIs. Their feature routes are not yet
registered in `app/api/v1/router.py`; existing tables are a foundation, not evidence
that Day 2 APIs are implemented or verified.

| Day 2 module | Backend dependencies | Effect of the two external items |
| --- | --- | --- |
| Workouts | User ownership, exercise/plan/session/set models, database transactions | Neither an Indian dataset nor a real client session is required to implement and test the module |
| Water tracking | User ownership, WaterLog, timestamps and quantity validation | No food-provider dependency; authentication can use the existing test harness |
| Daily activity | User ownership, DailyActivity, local dates and source handling | No food-provider dependency; client ingestion can be tested with controlled inputs |
| Sleep tracking | User ownership, SleepSession, timezone/duration validation | No food-provider dependency; real device/client validation remains a later integration concern |
| Progress analytics | Recorded weights, goals, workouts, water, activity and sleep; optional stored meal snapshots | Aggregation can be developed with controlled records; nutrition-specific coverage remains limited by available data |

`app/core/auth.py` supplies CurrentUser through signature-verified identity resolution;
`app/db/dependencies.py` supplies transaction-scoped sessions. These contracts can be
reused without changing production authentication. The authenticated PostgreSQL fixture
in `tests/integration/test_postgres.py` signs local RSA tokens and supplies controlled
JWKS to the real verifier. This supports endpoint and cross-user isolation tests without
a mobile client; it is not proof of real Clerk session compatibility. Food adapters are
initialized separately in `app/main.py`, and the tracking models do not call them.

### Remaining risks and verification gates

- Real Clerk issuer, audience/authorized-party alignment and actual session behavior
  still require end-to-end verification before frontend authentication is considered
  production-ready. Day 2 must retain authenticated ownership checks and add isolation
  tests; no authentication bypass is justified by this reassessment.
- Indian-food nutrition coverage remains unavailable. Analytics must preserve unknown
  nutrient values, distinguish missing logs from zero consumption, and avoid claims of
  comprehensive dietary coverage. Synthetic test records cannot become verified seeds.
- Day 2 still needs its own API design, implementation, constraints and tests. Timezone
  boundaries, activity-source deduplication, sleep overlap rules and progress definitions
  require explicit decisions. Existing model/schema tests do not establish those features.
- Historical nutrition analytics retain the documented pre-0003 activation-history gap
  and profile-timezone reinterpretation policy. These limits must remain visible.

This was a documentation-only dependency review. The previously recorded tests, Ruff
and migration checks were not rerun, and their dates/evidence below are preserved.
No application code or migrations were changed, and no Day 2 implementation was started.

## Results

| Component | Status | Evidence / limits |
| --- | --- | --- |
| Baseline | PASS | 120 tests passed, 0 skipped, in 125.77 seconds; Ruff check/format passed |
| Dependencies | PASS | `python -m uv sync --locked`: 85 packages resolved, 82 checked; no dependency changes |
| Final full suite | PASS | **155 passed, 0 failed, 0 skipped**, in 247.32 seconds; **138 isolated + 17 real PostgreSQL tests** |
| Historical goals | PASS | Real PostgreSQL tests cover October/November targets, multiple changes, paused periods, reactivation, dates before first goal, same-day changes, isolation and daily/dashboard agreement |
| Timezone and DST | PASS | Exact next-midnight exclusion; Asia/Kolkata and both 23/25-hour America/New_York days tested |
| Goal integrity | PASS | Unique user/effective timestamp and restricted referenced-goal deletion tested; user locks serialize transition writers |
| Weight recalculation | PASS | Logging alone leaves targets unchanged; preview reuses target/deficit; confirmation creates a snapshot; stale confirmation409 and foreign-weight404 tested |
| Recipes | PASS | Measured yield differs from raw weight; explicit oil contribution, unknown nutrient propagation, portions, private ownership, duplicate ingredients and immutable snapshots tested |
| Meal compatibility | PASS | Existing gram/portion CRUD, edits, deletion, snapshots and no-double-subtraction checks retained and passed |
| OFF deterministic resilience | PASS | 429/500/503, timeouts, network errors, invalid endpoint/request, Retry-After seconds/date, bounded backoff, eventual success and stale fallback tested |
| OFF live text search | PASS | A bounded live run returned **9 normalized foods, all with calories**; earlier503 is no longer reproduced in this run |
| OFF barcode | NOT RUN | No barcode API existed; none added |
| USDA | PASS | Live search returned **9 normalized foods, all with calories**; specific/general/legacy energy precedence covered by 6 regression cases |
| Indian catalog infrastructure | PASS | Classification, aliases, attribution, per100g nullable values, explicit portions, duplicate validation, search ordering, templates and private recipes implemented; import/alias tests pass |
| Verified Indian food coverage | BLOCKED | No verified licensed dataset available; no food nutrition values fabricated or imported from restricted sources |
| Clerk deterministic verifier | PASS | Signature, issuer, optional audience, expiration, authorized parties, pending session, missing token, cross-user isolation and JWKS rotation/cooldown tests pass |
| Clerk JWKS live | PASS | HTTP200 with RSA keys; no secrets printed |
| Clerk real-session end-to-end | BLOCKED | No actual client session available; no token requested in chat and no production bypass added |
| Development PostgreSQL | PASS | Pooled health/db200, direct SELECT1; **20 application tables plus Alembic**, **26 foreign keys** |
| Migration0003 | PASS | Applied after identity/environment confirmation; `alembic current`:0003(head); `alembic check`:no new upgrade operations |
| Migration safety | PASS | Disposable DB upgrade/downgrade/upgrade and metadata checks pass; upgrade preserves old goal values and does not invent earlier activation timestamps |
| Ruff | PASS | `ruff check .` and `ruff format --check .` passed; 65 Python files formatted |
| Secret hygiene | PASS | Zero configured credential matches across87 Git candidate files; `.env` remains ignored/untracked; `git diff --check` passed |
| R2 | NOT RUN | No storage integration in this scope; no storage mutations |

Intermediate 145-test run also passed before the final energy-ID, migration and auth
regression tests were added. Do not add intermediate/targeted counts to the final155.
The generated disposable databases were removed by the runner; no application tables
or user data were dropped. Existing `.env` credentials were used without disclosure.

## Historical policy and compatibility

Migration `0003_historical_goals_and_recipes.py` adds `goal_transitions`, `recipes`,
`recipe_ingredients` and `foods.food_kind`. The prior schemas had no reliable activation
history, so this migration is necessary; existing `created_at` and mutable status cannot
reconstruct pauses/reactivation. All prior goals and meal snapshots remain intact.

The last transition strictly before the next local midnight supplies that day's target.
The last change during a day wins for the whole day. Explicit pause/completion records a
null-goal transition. Each transition defines an interval until the next; timestamps
are unique per user and server-generated under the user lock. A paused or superseded
goal's present status does not erase its previous applicability. There is no backdating
or deletion API. Historical meal nutrient snapshots are never recalculated by goal changes.

For pre-0003 goals, only the active state at migration time is known reliably. Migration
seeds that state at migration time; earlier target history remains unknown/null. It does
not guess that creation meant activation. This is an explicit data limitation, not a
claim of recovered historical validity. Profile timezone changes reinterpret calendar
boundaries; storing past timezone changes would require a separate history feature.

Existing goal APIs remain compatible. Input revisions create new snapshots; activation
and status changes append transitions. Existing PUT profile with changed current weight
remains an explicit recalculation request. Adding a measurement never invokes it.
New authenticated endpoints:

- `POST /weight-logs/{id}/goal-preview`: uses that weight and the active target/deficit.
- `POST /weight-logs/{id}/apply-goal`: confirms `expected_goal_id`; stale state returns409.
- `POST /recipes`: creates immutable recipe/ingredient snapshots and a private food.
- `GET /recipes/{id}`: owner-only details. Recipe food UUID/portions work in existing meals.

All paths have the `/api/v1` prefix. See [API details](api-endpoints.md).

## Nutrition reliability

The finalized PROVIA formulas are unchanged. Recipe totals use actual ingredient grams;
per100g values divide by explicit measured final yield. Oils/ghee must be included as
ingredients. No retention factors, density, cooking loss, yield or missing nutrients
are guessed. Unknown contributions propagate to the recipe and set incomplete=true.
Final per100g values use the existing0.001 storage resolution; this is not laboratory
certainty. Custom records are user-provided, distinct from curated operator verification.

Independent review found USDA Foundation energy values were ignored when represented
as2047/2048. The adapter now chooses supplied2048 first,2047 next, then legacy1008,
without adding alternative estimates. [USDA energy documentation](https://fdc.nal.usda.gov/Foundation_Foods_Documentation/).
Existing persisted external foods are intentionally not silently overwritten; re-search
does not refresh an already cached row. Fixing old incomplete catalog rows needs an
explicit refresh/import policy; historical meal snapshots must remain unchanged.

The Indian catalog remains empty. Templates and the21-food research queue are under
`services/api/data/`. The template fails validation until attribution is supplied.
Only verified measurements with confirmed reuse rights should be imported. No assertion
of verified Paneer/Roti/Dal or other requested-food coverage is made.

## Open Food Facts investigation

The official feature matrix still lists legacy CGI for plain-text search; v3 product
API support does not provide an equivalent text-search endpoint. This implementation
retains `/cgi/search.pl`, uses application-specific User-Agent and JSON Accept headers,
and does not misroute text queries to structured v2 search. No barcode lookup existed.

Transient errors get at most3 attempts, with6/12-second exponential delays plus jitter.
Numeric or HTTP-date Retry-After is honored; a long delay is deferred through the
cooldown rather than slept within the request. Invalid requests/endpoints and access
denials are not retried. Timeout/network categories are distinct from HTTP429 and5xx.
Raw provider bodies never reach clients. Local/USDA results continue on OFF failures;
bounded stale query results can be reused with a `cached` status. Persisted catalog rows
remain available independently. These quotas/caches are per process, not distributed.

The earlier503 could have been provider load/global throttling or infrastructure; the
evidence does not prove a single cause or that retries alone resolved it. The latest
live request succeeded. [Official OFF documentation](https://openfoodfacts.github.io/openfoodfacts-server/api/).
Configure a real operator contact in OFF_USER_AGENT before public deployment.

## Verification commands and remaining blockers

Run from `services/api`:

```powershell
python -m uv sync --locked
python -m uv run ruff check .
python -m uv run ruff format --check .
python -m uv run python -m scripts.run_postgres_tests
python -m uv run alembic current
python -m uv run alembic check
python -m uv run python -m scripts.verify_services
```

`scripts.run_postgres_tests` invokes the complete pytest suite against a new randomly
named disposable database and removes only that database. `verify_services` makes
bounded read-only service checks and writes credential-free `service-verification.json`.
Application migrations were tested in disposable databases before applying0003 to the
confirmed development database. Downgrade checks never ran on application data.

Review found no additional confirmed defects in transition ordering, confirmation,
recipe yield calculations or retries. Authentication key rotation is tested with
local keys and mocked JWKS; unknown-key refreshes respect PyJWT's30-second cooldown.
All actual-session behavior remains unverified until a real client session is tested
locally. Verified Indian data coverage also remains unavailable. These external/data
limits keep external integration readiness partially blocked, but do not technically
prevent Day 2 backend development, as assessed above. Day 2 has not been started.

PROVIA DAY 1 CORE BACKEND — PASS; EXTERNAL INTEGRATION READINESS — PARTIALLY BLOCKED;
READY FOR DAY 2 BACKEND DEVELOPMENT: YES.
