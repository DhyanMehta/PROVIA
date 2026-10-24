# Frontend API integration

Day3 provides backend contracts for Expo React Native Android development. It does
not implement a frontend. Real Clerk session and Health Connect device verification
are still pending; automated signed-token tests are not substitutes.

## Base URL and networking

Set the frontend's public API base URL in deployment configuration, ending in
`/api/v1` by default. Never put backend secrets or database URLs in Expo public config.
Use HTTPS for deployed APIs. For the standard Android emulator, `10.0.2.2` refers to
the host loopback interface; `localhost` on a device refers to that device. For a
physical device, use an authorized development tunnel or reachable host address,
with narrowly scoped firewall access. Do not hardcode a developer's LAN address.
Android cleartext/network security behavior must be configured only for development.
See [Android emulator networking](https://developer.android.com/studio/run/emulator-networking).

## Authentication

Get a current session token from the configured Clerk SDK and send
`Authorization: Bearer <session-token>`. The API does not read session cookies and
never accepts a client-provided user ID as authority. Use the development Clerk
instance during development. Native tokens may omit `azp`; preserve the backend's
configured authorized-party contract instead of adding a fake web origin. Audience
is checked only when AUTH_AUDIENCE is configured. A present `azp` must be allowed;
AUTH_REQUIRE_AUTHORIZED_PARTY additionally requires its presence.

The client owns session refresh and secure storage. Do not copy tokens into logs,
analytics, URLs or persisted offline request bodies. On401 refresh through Clerk at
most once, then require sign-in; do not loop on401/403. A pending Clerk session is403.
The backend checks signed JWTs locally and has no per-request session-state lookup.
Sign-out stops normal refresh but does not guarantee immediate rejection of an
already-issued JWT before expiry. See [Clerk session tokens](https://clerk.com/docs/guides/sessions/session-tokens)
and [manual verification](https://clerk.com/docs/guides/sessions/manual-jwt-verification).

## Contract source and types

[API inventory](api-endpoints.md) explains all route families. The authoritative
machine-readable schema and generated TypeScript live in
`packages/api-contracts/openapi.json` and `schema.d.ts`. Follow that package's README
to regenerate, check for drift and type-check. Swagger is `/docs`, OpenAPI is
`/openapi.json`. All user-owned operations use HTTPBearer; only health endpoints and
the two stateless nutrition calculation previews are public. Schema generation checks
all47 path entries, response definitions, reference resolution and unique operation IDs.

Request bodies reject unknown properties. Use ISO `YYYY-MM-DD` for dates and RFC3339
timestamps with an explicit offset or `Z`; naive timestamps fail validation. Local
calendar boundaries use the user's IANA profile timezone (UTC before a profile),
including DST. Changing timezone reinterprets historical day boundaries. Sleep belongs
to the local wake-up date, workouts to the start date. Daily activity carries an
explicit local date and is not rebucketed from `synced_at`.

Send decimal quantities as strings to avoid binary floating-point round trips. Decimal
responses remain strings; use a decimal library or display them directly. `null` is
unknown/not configured, not zero. Do not recompute the finalized nutrition targets
in the frontend. Show server snapshots and historical targets.

Examples derived from `WaterCreate`, `WaterOut` and the actual error envelope:

```json
{"amount_ml":"250.125","consumed_at":"2026-10-24T08:00:00Z"}
```

```json
{"id":"11111111-1111-4111-8111-111111111111","amount_ml":"250.125","consumed_at":"2026-10-24T08:00:00Z"}
```

```json
{"error":{"code":"VALIDATION_ERROR","message":"Request validation failed","details":[{"source":"body","code":"missing","message":"Invalid or missing value"}]}}
```

The UUID above is illustrative. Create responses use201; deletes use204 with no JSON
body. Lists return `items`, `limit`, `offset`, without a total count. Limits are1–100,
default20; offset is nonnegative. Stop paging on a short page; a full last page can
require one empty request. Ordering/filter options differ by endpoint and are recorded
in the inventory. Changing data between pages can shift offset pagination.

## Errors, retries and offline operation

Every response has a server-generated `X-Request-ID`. Report this ID and safe error
code when debugging; never attach tokens or health records. Client-supplied IDs are
not trusted. Native Android can read the header. Current browser CORS does not expose
it to JavaScript; web integrations need an explicitly reviewed expose-header change.
Error JSON stays `{error:{code,message,details}}`; request IDs are in headers only.
OpenAPI now documents this actual shape rather than FastAPI's default422 response.

- 401: missing/invalid/expired token;403: authenticated session not eligible.
- 404: absent or foreign-owned resource; do not infer another user's existence.
- 409: read the code, fetch current state and resolve the conflict. Never blindly
  overwrite SOURCE_CONFLICT, STALE_SYNC, SYNC_CONFLICT or terminal workout state.
- 422: invalid payload, dates/ranges or domain rules. Correct input, not repeated retries.
- 413: body exceeds MAX_REQUEST_BODY_BYTES (default16MiB). Split valid work into
  separate supported requests; no batch-import endpoint exists.
- 503: database/auth/provider unavailable. Retry safe reads with bounded exponential
  backoff and jitter. 500 requires correlation by request ID.

No distributed rate limiter is implemented;429 may be emitted by a deployment gateway,
whose envelope can differ. Honor bounded Retry-After if present. Unknown transport
outcome on POST is not permission to retry: water, meal, weight and workout creation
have no generic idempotency key. Reconcile with owned lists/user confirmation first.
Health Connect activity exact snapshot replay and sleep import IDs are exceptions
described in [Health Connect integration](health-connect-integration.md).

Queue offline work per signed-in account using protected local storage, retaining
payload/revision metadata but obtaining a fresh token only when sending. Never replay
one user's queue under another account. Preserve operation order and discard pending
uploads for records whose deletion has been acknowledged. Surface partial failures;
do not mark a whole sync successful until each intended request is acknowledged.

## Real Clerk verification procedure — BLOCKED until executed

1. Start the local backend with the existing development configuration. Confirm its
   issuer belongs to the intended development Clerk application, not production.
2. Sign in to that app using an authorized test account in a real client. Obtain its
   current session token through Clerk's SDK in a private local debugging workflow.
   Do not send passwords, OTPs or tokens to Codex. Do not use a manufactured JWT.
3. In a local interactive terminal, from `services/api`, run
   `uv run --no-sync python -m scripts.verify_clerk_session` and paste the token at the
   hidden prompt. It is never a command argument, shell-history entry or repository file.
   The harness requires a loopback HTTP API and development Clerk issuer, sends no
   redirects, verifies missing/invalid-token rejection, checks `/me` against the
   verified subject's database identity, and reads the owned water-log collection.
   `/me` may provision the test user as normal; the harness writes no health records.
4. After that same token expires, rerun with `--phase expired` and the same token.
   Do not replace it with a fresh SDK token. Record only outcome/time/request IDs.
5. With a fresh token retained privately, sign out in Clerk and run `--phase signed-out`.
   Record whether it remains accepted before expiry, then repeat the expiry check.
   The script reports this observation, not an immediate-revocation guarantee.

The operator must attest token provenance, account correspondence and sign-out timing.
The harness alone cannot prove that a token was obtained from a real client. No such
session was available in this implementation environment, so these checks remain BLOCKED.
