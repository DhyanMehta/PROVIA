# Backend architecture

## Request flow

`APIRouter → service → repository → SQLAlchemy model` in a modular monolith.
Users, profiles/goals/weights, and nutrition have feature directories. Shared typed
metadata lives in `app/db/models.py` to avoid circular model imports. Workout and
activity models are schema-only; their APIs are not implemented on Day 1.

The factory builds a lazy Database manager and TokenVerifier. Importing the app
does not open database or provider connections. Lifespan disposes the engine on
shutdown. All blocking database/provider endpoints and dependencies use synchronous
functions so FastAPI executes them in its worker pool.

## Transactions and ownership

Each request gets one SQLAlchemy session. Function-scoped dependency cleanup commits
before sending success. Failure rolls back and closes the session. Constraint conflicts
return sanitized 409, database failures 503. Repositories flush but do not commit;
services can compose meal and item operations atomically.

JWT verification runs before opening a session. Verified `sub` identifies the local
user. Provisioning uses PostgreSQL ON CONFLICT against a unique subject; email is
copied initially only when the issuer marks it verified. PATCH /me modifies contact
email only. Single-issuer deployment is an explicit identity invariant.

Every user-specific query scopes by authenticated user ID. Foreign-owned IDs return
404 to avoid revealing their existence. Catalog foods are visible if shared or owned
by the caller. Custom foods cannot be made shared through the public API. Food and
exercise foreign keys prevent deletion of referenced catalog records. Profile upsert
is atomic. Goal mutations lock the owning user; activating a goal pauses the previous
active goal. A partial unique index enforces one active goal even outside the service.

## Query and integration behavior

Historical lists are paginated. Meal items and food portions use select-in loading.
Meal food lookups and provider imports are batched rather than queried once per item.
Daily summaries are bounded by a local calendar day but include all that day's meals.
The current API does not impose a per-day record quota; add rate limits/quotas before
public production use. Providers run with explicit timeouts and bounded search sizes.

Food search imports provider data into a shared cache without overwriting previously
imported rows. That avoids unannounced catalog changes; refreshing catalog data is a
future explicit policy. Missing nutrients stay unknown. USDA integration currently
requests Foundation records (the live-verified filter); its normalizer also accepts
SR Legacy and FNDDS fixtures. Branded/volume ambiguity is excluded.
OFF requires explicit gram evidence and excludes records marked as volume-based.
No density, nutrition value, or health target is invented.

Meal quantities are grams or an explicit portion plus count. Decimal calculations round
HALF_UP to 0.001. Nutrient snapshots are independent of later catalog updates. Replacing
items on PATCH recalculates from the current catalog; editing only notes/time retains
snapshots. Null propagates to totals if any contributing item is unknown.

Date filters and summaries use local midnight to next local midnight converted to UTC;
this respects 23/25-hour daylight-saving days. No profile means UTC.

## Errors, security, and operational boundaries

Request logging wraps CORS, which wraps the sanitized error boundary and routing.
See [Starlette middleware guidance](https://www.starlette.io/middleware/). Request IDs
are UUID v4, generated server-side, isolated with ContextVar and reset in finally.
Logs use route templates, not user-controlled URL path values. Error bodies omit
exceptions, request inputs, and stack traces. HTTP auth headers are preserved.

RS256 is pinned independently of the JWT's algorithm. Issuer, configured audience, expiration,
subject, and JWKS key are validated. The trusted JWKS URL must be HTTPS. Five-minute
JWKS caching allows key rotation; unknown keys refresh. No password handling or token
bypass exists. Live provider verification and deployment hardening remain separate
from controlled-key unit tests.

Clerk's optional aud is verified only when configured. Present azp claims must match
AUTH_AUTHORIZED_PARTIES. Missing azp is rejected only when the require flag is enabled.
Standard Clerk development issuer URLs can derive their JWKS endpoint; custom domains
require an explicit trusted endpoint. Pending sessions are rejected.

Neon application pooling uses transaction-local UTC and statement timeouts rather than
startup `options`, which the pooler rejected during live verification. Direct migrations
use NullPool. Engine creation remains lazy and connection URLs never enter app logs.

## Goals and curated catalog

`nutrition/targets.py` is the single Decimal calculation service used for previews,
goal creation, goal revisions, and profile weight changes. Goal snapshots preserve
inputs and calculation version. Active mutations serialize through a user-row lock.
Weight logs append measurements; PUT profile explicitly changes canonical current
weight. Daily and dashboard share aggregation and select the last immutable goal transition
before local day-end. Same-day changes use the last transition; pauses explicitly clear
targets. Migration0003 seeds only known active state, without inventing past activations. No exercise calorie adjustment is made.

Provider requests use process-local bounded query caches (128 entries, 300s), per-provider
cooldowns (6s default), and Retry-After handling for HTTP429. These are per worker, not
a distributed quota system. Cached food rows are shared; custom foods remain private.

`data/indian-foods.json` is intentionally empty. Import a JSON array of verified records
using the FoodCreate shape plus source_food_id, source_url, license_name, and optional
aliases. Nutrients are per100g, nullable, and portions have explicit gram weights.
Aliases are normalized for exact case-insensitive matching; names support substring
search. Sources and license attribution are required; verified_at records import time
after the operator confirms review. The flag is an attestation, not automatic fact checking.

```powershell
# From services/api, after verifying nutrition and rights for the supplied file:
python -m uv run python -m scripts.import_indian_catalog path/to/licensed.json --confirm-licensed-and-verified
```

Imports are atomic, capped at5MB/5000 records, deduplicated by source/ID, and batched.
Existing rows are reused, never silently overwritten. No restricted data was scraped.

R2 dependencies/configuration are retained from Task 1, but storage is not used yet.
No Redis, Celery, Docker, microservices, AI, or frontend was introduced.

## Primary references

- [SQLAlchemy pooling](https://docs.sqlalchemy.org/en/20/core/pooling.html)
- [Neon pooled versus direct connections](https://neon.com/docs/connect/connection-pooling)
- [PyJWT usage and JWKS verification](https://pyjwt.readthedocs.io/en/stable/usage.html)
- [USDA API guide](https://fdc.nal.usda.gov/api-guide/)
- [Open Food Facts API](https://openfoodfacts.github.io/openfoodfacts-server/api/)

Recipe/ingredient tables retain measured yield and ingredient nutrient snapshots. User-created recipes produce private foods consumed by the unchanged meal snapshot flow. See the final review and API documentation for confirmation and retry policies.
