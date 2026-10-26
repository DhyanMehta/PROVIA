# Backend operations

Current authentication and revision0005 operations are documented in the
[first-party cutover runbook](first-party-auth-completion-report.md). Earlier Clerk
probe references in this document are historical; runtime no longer uses JWKS.

Run backend commands from `services/api`. Keep the existing Python3.12.15 environment,
SQLAlchemy2.1.6 pure-Python build and uv.lock. Windows Application Control remains
enabled. **Never run ordinary uv sync in this repaired environment.**

```powershell
uv run --no-sync python -c "import sqlalchemy; from sqlalchemy.util._has_cython import HAS_CYEXTENSION; print(sqlalchemy.__version__, HAS_CYEXTENSION)"
uv run --no-sync uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Expected import: `2.1.6 False`. If native loading is blocked, record the exact file
and policy error for authorized administrator review. Do not rename/remove `.pyd`
files, disable policy, change Python requirements or download alternate binaries.
The established supported source build is part of this local environment; recreating
it needs its approved build procedure, not a blind dependency synchronization.

## Configuration and readiness

Keep credentials in ignored `.env`/deployment secret storage; never print the file.
Database URLs are SecretStr, engine parameters are hidden, Neon TLS is required, and
direct migration URLs reject pooler hosts. The application pool is5 plus5 overflow,
10s acquisition timeout,5s connection timeout,10s transaction statement timeout and
300s recycle. Assess total connections across workers before deployment. Non-Neon
PostgreSQL TLS must be explicitly configured and verified for that environment.

- `/api/v1/health`: process liveness; no database or food API dependency.
- `/api/v1/health/ready`: legacy application-startup readiness, preserved unchanged.
- `/api/v1/health/db`: database readiness using SELECT1; use this for deployment
  traffic-readiness checks. It returns503 safely when the DB is unavailable.
- Optional food providers and Clerk JWKS need separate bounded probes. Provider failure
  must not remove process liveness. Do not place credentials in probe URLs or logs.

All responses include server-generated X-Request-ID, nosniff and no-referrer headers.
CORS remains the existing explicit-origin policy, with no wildcard expansion. Docs
and OpenAPI remain enabled for compatibility. Production ingress should restrict
documentation exposure as required; CORS is not an access-control substitute.

## Limits, security and reliability

MAX_REQUEST_BODY_BYTES defaults to16MiB, configurable from1KiB to64MiB. It covers
bounded nested weekly plans even with escaped Unicode text. Both Content-Length and
actual streamed bytes are checked before parsing/authentication/database work. An
oversize request returns413; invalid/ambiguous lengths return400. This protects per-
request buffering, not connection concurrency or slow uploads. Enforce header size,
read timeout, concurrent connections and distributed request budgets at the ingress.

Existing collection bounds remain: pagination100, plan7days/50exercises per day,
workout500sets, sleep500stages, meals/recipes100items, analytics366days and10000rows
per bounded query. Food searches cap query length100 and local results20. Individual
daily nutrition summaries still load that day's meals/items; extreme per-user daily
volumes are an outstanding performance limit to assess before public scale. Historical
analytics uses bounded batched queries and tested query-count stability across ranges.
No new indexes or schema changes are justified by the current workload evidence.

No distributed rate limiter was added. Before public deployment, configure a trusted
gateway policy for authentication failures and expensive endpoints, with shared
state, verified proxy addresses, bounded Retry-After, alerting and measured budgets.
Do not substitute a per-process in-memory limiter for distributed protection. TLS/HSTS,
network access, backups, restore drills, retention/erasure and abuse monitoring remain
deployment responsibilities; this completion does not certify production launch.

Authentication uses only configured HTTPS JWKS, RS256 and issuer; ignores token jku
URLs; requires exp/iss/sub; validates optional nbf/iat and configured aud/azp. Numeric
dates must be finite JSON numbers, not strings/bools; optional sid/sts must be nonempty
strings. Missing optional Clerk claims are not newly required. Pending sessions are403.
JWKS set TTL300s, unknown-key refresh cooldown30s and HTTP timeout5s are retained.
Connection failures now impose a5s per-process retry cooldown. Rotation can temporarily
reject a new key during cooldown; no indefinite per-key cache is enabled. Stateless
verification does not immediately revoke issued JWTs when a session ends.

## Logs and troubleshooting

PROVIA emits JSON lines with request_id, environment, method, route template, status,
duration_ms and safe error_category. Route templates may omit the mounted API prefix;
unmatched paths log `<unmatched>`. Generated IDs prevent user-controlled log injection.
No identity, request body, headers, query, exception value or traceback is recorded.
Transport debug and Uvicorn access logs are disabled because URLs can contain secrets.
Keep proxy/server logging equally restrictive. A request ID is in the response header,
not a new error-body field. Database failures retain DATABASE_UNAVAILABLE/CONFLICT.

-401: check issuer/audience/azp, expiry and device clock using safe local tooling;
  never paste tokens into online JWT decoders or tickets.
-503 AUTH_UNAVAILABLE: check configured JWKS HTTPS endpoint,5s timeout/cooldown and
  provider availability. Do not bypass signature checks.
-503 DATABASE_UNAVAILABLE: check network/TLS/pool capacity and direct versus pooled
  config without outputting URLs; use health/db and request IDs.
-409 sync errors: reconcile current state; retry the same acknowledged snapshot only.
-422: inspect machine-readable category/schema, not the deliberately sanitized inputs.
-413: reduce payload or review the documented limit; do not disable request protection.
-500: correlate safe logs; reproduce with synthetic inputs in a disposable environment.

## Verification and migrations

```powershell
uv run --no-sync python -m scripts.run_postgres_tests
uv run --no-sync ruff check .
uv run --no-sync ruff format --check .
uv run --no-sync alembic current
uv run --no-sync alembic check
uv run --no-sync python -m scripts.export_openapi --check
```

The runner creates a randomly named disposable database from approved development
configuration, runs the full suite, redacts connection details and removes only that
generated database. Confirm the cleanup message. Never set disposable-test consent
against an application database. Downgrade/upgrade round trips occur only in generated
test schemas; no reset/downgrade of development or production is part of Day3.
Head remains0004 and21 application tables. No0005 is needed. Day3 performs read-only
application DB inspection and compares record counts before/after verification.

`uv audit --frozen --no-build --no-python-downloads` is uv's read-only lockfile audit;
it does not synchronize or install dependencies. Run it through the existing uv
installation (uv itself is not installed in the application virtual environment).
Python execution/tests/Alembic/Ruff always use `uv run --no-sync`. Do not automatically
apply audit fixes or upgrade pinned packages. The independent contracts npm package
uses a frozen lockfile and lifecycle scripts disabled; see its README.

Use the interactive real-session procedure in [frontend integration](frontend-api-integration.md).
Use the future device checklist in [Health Connect integration](health-connect-integration.md).
Neither a reachable JWKS endpoint nor passing local JWT fixtures proves real sign-in.
