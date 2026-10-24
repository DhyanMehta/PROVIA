# PROVIA backend

Android-first fitness and wellness tracking. Day 1 Tasks 1–8 implement the backend
foundation, database schema, managed JWT authentication, onboarding, and nutrition.
Day 2 adds exercise catalogs, workout plans/sessions/sets, water targets and logs,
activity synchronization, sleep tracking, a unified dashboard and progress analytics.
Mobile and test-web remain placeholders; frontend and AI functionality are not implemented.

## Existing Windows development environment

SQLAlchemy 2.1.6 is installed using its supported pure-Python source build under
Windows Application Control. Preserve this installation: **do not run ordinary
`uv sync` in this environment**. Use `uv run --no-sync` for Python, pytest, Ruff
and Alembic commands (or `python -m uv run --no-sync` when uv is not on PATH).
The generic clean-install instructions below are not a repair procedure for this
managed environment. Never disable security controls or manually alter `.pyd` files.

```powershell
cd services/api
uv run --no-sync python -m scripts.run_postgres_tests
uv run --no-sync ruff check .
uv run --no-sync ruff format --check .
uv run --no-sync alembic current
uv run --no-sync alembic check
```

See [Day 2 completion report](docs/day2-completion-report.md) for verification,
limitations and frontend integration readiness. Real Clerk client verification and
verified reusable Indian nutrition data remain separate external blockers.

## Stack

Python 3.12, FastAPI, Pydantic v2 / pydantic-settings, SQLAlchemy 2, Alembic,
Psycopg 3, uv, HTTPX, PyJWT / cryptography, Pytest and Ruff. Neon PostgreSQL is the
intended database. Cloudflare R2 is reserved for later work. Planned mobile stack:
React Native, Expo, TypeScript, Expo Router, NativeWind, TanStack Query, Zustand,
Expo SQLite, Android Health Connect.

## Clean installation on an approved environment

From this repository in PowerShell:

```powershell
python -m pip install --user uv
cd services/api
python -m uv python install 3.12
python -m uv sync --locked
# Copy only if .env does not already exist:
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
python -m uv run --no-sync uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --no-access-log
```

Use `uv` instead of `python -m uv` when uv is installed as a standalone executable.
The local `.env` is git-ignored. Never paste real credentials into source files.

[Swagger](http://127.0.0.1:8000/docs), [OpenAPI](http://127.0.0.1:8000/openapi.json),
[liveness](http://127.0.0.1:8000/api/v1/health),
[readiness](http://127.0.0.1:8000/api/v1/health/ready),
[database health](http://127.0.0.1:8000/api/v1/health/db).

Without external configuration the app starts and liveness/readiness return 200.
Database health returns 503 until SELECT 1 succeeds. Authenticated operations require
both a configured provider and migrated PostgreSQL database. Readiness means the
application initialized; it deliberately does not claim external-service readiness.

## Configuration

Pydantic loads `services/api/.env`, independent of working directory. Environment
variables take precedence. Cached settings require a restart after changes.

| Variable | Meaning / default |
| --- | --- |
| APP_NAME | `provia-api` |
| APP_VERSION | `0.1.0` |
| APP_ENV | development (or testing, staging, production) |
| DEBUG | false; local debug logging only, never traceback responses |
| API_V1_PREFIX | `/api/v1` |
| CORS_ORIGINS | JSON array, default `["http://localhost:5173"]` |
| CORS_ALLOW_CREDENTIALS | false; enable only for trusted origins |
| LOG_LEVEL | DEBUG / INFO / WARNING / ERROR / CRITICAL; defaults to INFO or local DEBUG |
| DATABASE_URL | Neon pooled PostgreSQL connection string for application traffic |
| DIRECT_DATABASE_URL | Direct, non-pooler PostgreSQL URL for Alembic |
| AUTH_ISSUER | Exact issuer of API access tokens |
| AUTH_AUDIENCE | Optional; leave empty for Clerk session tokens without aud |
| AUTH_JWKS_URL | Trusted HTTPS JWKS URL; derived for standard Clerk development issuers |
| AUTH_AUTHORIZED_PARTIES | JSON array of permitted azp origins; default localhost:5173 |
| AUTH_REQUIRE_AUTHORIZED_PARTY | false; reject missing azp when enabled |
| NUTRITION_MIN_DAILY_CALORIES | 1500; configurable product safeguard, not clinical validation |
| FOOD_PROVIDER_CACHE_SECONDS | 300; process-local search cache |
| FOOD_PROVIDER_MIN_INTERVAL_SECONDS | 6; per-provider request cooldown |
| USDA_API_KEY | USDA FoodData Central key; optional, missing provider is reported unavailable |
| FOOD_HTTP_TIMEOUT_SECONDS | 5; positive, maximum 30 |
| OFF_USER_AGENT | Identifiable app name/version and your contact email for live OFF requests |
| R2_ENDPOINT_URL, R2_BUCKET_NAME | Reserved storage configuration |
| R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY | Reserved storage secrets |
| TEST_DATABASE_URL | Separate disposable **direct** PostgreSQL URL; integration tests only |
| TEST_DATABASE_DISPOSABLE | false; explicit true required to run PostgreSQL tests |

The test variables are read by the test fixture, not application settings. Credentials
and database URLs use masked settings fields. Configuration is never returned by APIs.

## Neon setup and migrations

1. Use a **development branch**, not production. Copy its pooled string into
   DATABASE_URL and its direct string into DIRECT_DATABASE_URL in `.env`.
2. Keep `sslmode=require` (or stronger verification) on Neon URLs. The engine enforces
   at least `require` for `.neon.tech` hosts. Standard `postgresql://` URLs are converted
   to the Psycopg 3 SQLAlchemy dialect internally.
3. Confirm the selected database is a safe development database, then run:

```powershell
# From services/api
python -m uv run --no-sync alembic upgrade head
python -m uv run --no-sync alembic current
python -m uv run --no-sync alembic check
```

Revision `0001_initial` creates the original17 MVP tables; `0002` adds goal snapshots
and curated-food metadata. `0003` adds goal transitions, recipes and recipe ingredients
(20 application tables total), plus food classification, without dropping existing data. The application never creates
or migrates tables automatically. Migrations reject pooled URLs. See
[Neon's pooling documentation](https://neon.com/docs/connect/connection-pooling).
Do not downgrade a database containing real data. Automated downgrade checks operate
only in generated test schemas in a separately configured disposable test database.

## Authentication

Configure Clerk's exact AUTH_ISSUER and optional AUTH_AUDIENCE for your token format.
Standard `*.clerk.accounts.dev` issuers derive `/.well-known/jwks.json`; custom domains
require AUTH_JWKS_URL. Only RS256 is accepted. Set AUTH_AUTHORIZED_PARTIES to trusted
frontend origins; a present azp must match. Missing azp is accepted unless the require
flag is enabled, accommodating non-browser clients. Pending sessions are rejected.
The API verifies signature, issuer, configured audience, expiration, and subject; it does not use
an unverified user ID. JWKS is cached for five minutes with a five-second fetch timeout.
Unknown keys trigger a refresh. Missing bearer tokens return 401 with WWW-Authenticate;
an unconfigured/unavailable provider returns 503. There is no development token bypass.

Send `Authorization: Bearer <access-token>`. Local user provisioning is keyed by the
provider subject and uses a PostgreSQL unique constraint plus ON CONFLICT to handle
concurrent first logins. This deployment supports one issuer; migrating to another
issuer requires an explicit identity migration. PATCH /me changes contact email only,
not provider identity or sign-in credentials. No passwords are stored.

## Nutrition and API conventions

See [API endpoints](docs/api-endpoints.md) for routes and examples. Collection responses
use `{ "items": [...], "limit": 20, "offset": 0 }`. Historical lists accept limit 1–100
and nonnegative offset. Ownership is derived from the authenticated user; cross-user
IDs return 404. Inputs reject extra fields, including client-supplied user IDs.

Food search supports `source=all|local|indian_curated|usda|open_food_facts`. Provider results are cached
as shared catalog entries with UUIDs. Custom foods are private. USDA and OFF adapters
normalize only records with a supported gram basis; volume conversions are never guessed.
Missing nutrients remain null. Meal snapshots use Decimal, per-100-g values, and 0.001
rounding. Goal calculations preserve intermediate precision. Decimal values serialize
as JSON strings. External requests have timeouts, bounded caches, cooldowns, and 429 handling.
Search reports provider status on partial results and 503 when all requested providers
fail and no local results exist. No live provider calls run in automated tests.

Meal creation and item replacement are atomic. PATCH without `items` preserves snapshots;
with `items`, it replaces the entire item list and calculates fresh snapshots from the
catalog. Catalog changes alone never alter historical meals. Daily totals use the user's
IANA timezone (UTC before onboarding), including daylight-saving boundaries. A nutrient
total is null when any included item has an unknown value; an empty day's totals are zero.
Historical dashboards use the last goal transition before local day-end; same-day
changes use the last transition. Pre-0003 activation history cannot be reconstructed
reliably and is not fabricated. Weight logs require preview/confirmation to change goals.
Private recipes require measured final yield and explicit ingredient quantities.

Targets are calculated from current weight, target weight, and chosen deficit using
the approved PROVIA formulas. Preview maintenance before choosing a deficit, then save
through the authenticated goal API. Relevant input changes create new goal snapshots.
The dashboard reports remaining calorie/macro budgets without double subtraction.
See [nutrition calculations](docs/nutrition-calculation.md) for exact formulas and safeguards.
These are estimates, not clinically validated maintenance or dietary recommendations.

## CORS, errors, and logging

CORS accepts exact configured HTTP(S) origins, never wildcards. Credential support is
opt-in. Common methods and Accept, Authorization, Content-Type are allowed; no response
headers are exposed to browser JavaScript. CORS does not replace authentication.

Application, HTTP, validation, and unexpected errors use:

```json
{"error":{"code":"RESOURCE_NOT_FOUND","message":"Requested resource was not found","details":null}}
```

Validation details contain source and error code without sensitive inputs, dynamic
location segments, or validator messages. HTTP exception headers are preserved.
CORS preflight rejections retain Starlette's standard response format.

Logs contain timestamp, level, environment, generated UUID request ID, method, route
template, status, and duration. X-Request-ID is returned on responses. Incoming IDs are
ignored; context variables isolate concurrent requests. Raw paths, query strings, bodies,
tokens, settings, exception values, and tracebacks are excluded from application logs.
Unexpected failures log a generic correlated message. Uvicorn access and HTTPX logging
are suppressed to prevent raw URL/key logging. Use the documented no-access-log command.
Middleware order keeps request IDs and CORS on sanitized 500 responses. Logging settings
are process-wide; run one environment per worker.

## Tests and checks

```powershell
# From services/api
# Use the already provisioned environment; do not sync this managed installation.
python -m uv run --no-sync pytest -v
python -m uv run --no-sync ruff check .
python -m uv run --no-sync ruff format --check .
```

For PostgreSQL tests, set TEST_DATABASE_URL to a dedicated disposable direct connection
and TEST_DATABASE_DISPOSABLE=true in `.env`. The database role must be able to create
schemas. Tests use unique `provia_test_<uuid>` schemas, migrate them, and remove only
those generated schemas. They never reset/drop the database. No SQLite substitution.

Alternatively, on the configured **development** direct connection with CREATEDB rights:

```powershell
python -m uv run --no-sync python -m scripts.run_postgres_tests
```

This runner creates a fresh `provia_verify_<uuid>` database, runs the full suite there,
and removes only that generated database in finally. It never resets the application DB.
`python -m uv run --no-sync python -m scripts.verify_services` performs read-only live checks and
writes credential-free statuses to `docs/service-verification.json`.

The Indian catalog ships empty because no verified licensed dataset was supplied.
See the import contract in [architecture](docs/backend-architecture.md). Custom foods
and food-specific household portions are supported now; no universal roti/katori weight
or fabricated Indian nutrition data is bundled.

```powershell
python -m uv run --no-sync pytest tests/integration -v
python -m uv run --no-sync pytest -m "not integration" -v
```

## Structure and further documentation

```text
apps/{mobile,test-web}/             # placeholders
packages/api-client/               # placeholder
services/api/
  app/
    main.py                        # factory / lifespan
    core/                          # settings, auth, CORS, errors, logging
    db/                            # typed schema, lazy engine, session dependency
    api/v1/{router.py,endpoints/}   # versioned routing / health
    modules/{users,profiles,nutrition}/ # routers, schemas, services, repositories
    integrations/foods.py           # USDA / OFF adapters
  alembic/{env.py,versions/,script.py.mako}
  alembic.ini
  tests/                           # isolated tests + opt-in PostgreSQL integration
  .env.example
  .python-version
  pyproject.toml
  uv.lock
docs/
  backend-architecture.md
  database-schema.md
  api-endpoints.md
  nutrition-calculation.md
  day1-completion-report.md
```

[Architecture](docs/backend-architecture.md) · [Schema](docs/database-schema.md) ·
[Verification report and remaining configuration](docs/day1-completion-report.md).
The report distinguishes implementation, mocks, and real-service verification; this
backend has not been demonstrated production-ready.


## Final Day1 hardening

[Final review](docs/day1-final-review.md) contains the latest test counts and blockers.
See [API contracts](docs/api-endpoints.md) for historical targets, weight-log preview /
confirmation, recipes and provider retry behavior. The finalized goal formulas are
unchanged. [Catalog templates and import rules](services/api/data/README.md) include
an unpopulated attribution template and the Indian-food research queue; no Indian
nutrition coverage is claimed without licensed verified records.

Open Food Facts text search remains on its documented legacy CGI endpoint: the newer
product API does not provide equivalent plain-text search. Retries are bounded and
spaced, Retry-After is respected, and local/USDA results remain usable on failure.
Configure OFF_USER_AGENT with an application/version and real operator contact before
public deployment. FOOD_PROVIDER_STALE_SECONDS defaults to3600; stale results are labeled.
Clerk JWKS refreshes for unknown keys respect PyJWT's30-second cooldown; valid cached
keys remain usable. Live Clerk authentication still needs an actual client session.
