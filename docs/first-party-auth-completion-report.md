# First-party authentication implementation and controlled cutover

Date: 26 October 2026. Branch: `codex/first-party-auth`; baseline: `d800158`.
This is a locally verified implementation, not a deployed authentication cutover.
The existing application database and installed phone application were not changed.
Final verification results are recorded below. This report separates automated checks
from the unverified email, deployment and device cutover.

## Architecture and data preservation

Application ownership remains `users.id`, independent of an authentication provider.
All fitness routers retain the existing `CurrentUser` dependency and ownership checks;
it now resolves a signed first-party access token against persisted account/session
state. No request body can grant ownership. Missing or malformed bearer headers are
rejected before database access. Pending verification can access account/security
operations, but cannot read or write fitness data. Disabled accounts are denied.

Revision **0005**, based on **0004**, adds five tables: `auth_accounts` (unique normalized
email and unique link to application user UUID), `auth_sessions` (one absolute-lifetime
login family), `auth_refresh_tokens` (rotation history), `auth_actions` (purpose-scoped
verification/reset), and `auth_rate_limits` (shared HMAC-keyed abuse counters).
Existing user/fitness tables, foreign keys, IDs and records are preserved. There are
26 application tables after upgrade. There is no startup/build-time auto-migration.
The migration is **READY, not APPLIED** to the existing database.

New accounts get a new application UUID and a reserved `provia:<uuid>` value in the
old required provisioning column. That value is provenance only, never credential
proof. Old provider-provisioning service/repository methods have been removed.
Existing nutrition formulas, historical goal snapshots and meal calculations are
unchanged. PostgreSQL tests cover cross-user access, historical calculations and
upgrade/downgrade preservation of a legacy user and weight record.

## Existing-user enrollment

There is **no automatic email-based merge**. `users.email` is mutable contact data,
not a verified login identity. Registering an address matching an unclaimed legacy
contact returns the same generic response and creates no replacement user/account.
Legacy users therefore cannot yet sign in through the replacement just by choosing
their old email. Password reset also cannot claim a legacy record.

Safe operator-assisted enrollment must separately establish ownership of the old
provider subject through a valid old session/verified export and identity review,
then prove the new email, choose a password through a controlled one-time flow, and
create exactly one auth-account link to the **existing** UUID transactionally. Check
both email and user-link uniqueness, preserve evidence without retaining raw tokens,
and never infer a link from a contact email alone. This operator enrollment workflow
is **not implemented or executed** here; keep affected users on the old release or
defer cutover until the operator flow is reviewed and approved. No admin bypass or
public claim endpoint is exposed.

## Authentication contract

All routes below are prefixed `/api/v1/auth`.

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/register` | Generic202; pending account and verification action when issuance succeeds |
| POST | `/login` | Generic bad-credential401; tokens and minimal account on success |
| POST | `/refresh` | One atomic rotation; replay revokes the entire family |
| POST | `/logout` | Idempotent family revocation using an opaque refresh credential |
| POST | `/logout-all` | Authenticated revocation of all account families |
| GET | `/me` | Minimal account identity and verification status |
| POST | `/verify-email` | Atomic single-use verification; no automatic sign-in |
| POST | `/resend-verification` | Generic202; rate-limited issuance |
| POST | `/forgot-password` | Generic202; rate-limited eligible-account issuance |
| POST | `/reset-password` | Single-use reset; invalidates all sessions/reset actions |
| POST | `/change-password` | Current password required; invalidates sessions/reset actions |
| GET | `/sessions` | Most recent100 active families, scoped to the account |
| DELETE | `/sessions/{session_id}` | Own session revocation; foreign account returns404 |

Auth responses and errors use `Cache-Control: no-store` and `Pragma: no-cache`.
Validation errors contain no submitted secrets. Ordinary invalid credentials are401,
pending/disabled accounts403, invalid/expired action links400, schema errors422,
abuse throttles429 and actual infrastructure/configuration failures503.
The generated OpenAPI and TypeScript artifacts contain60 paths. Business response
shapes are retained; FastAPI qualifies the two auth/workout `SessionOut` schemas.

## Passwords, tokens and abuse controls

Passwords use maintained argon2-cffi25.1.0, Argon2id,19MiB memory,2 iterations,1 lane,
per-password salts and a maximum of two concurrent hash operations per process.
Passwords require15–128 Unicode characters and at most512 UTF-8 bytes; whitespace
and Unicode are preserved exactly. Email normalization is separate. Login performs
a dummy hash for unknown accounts and rechecks the password hash under the account
lock, preventing an overlapping reset from creating a session with old credentials.

Access JWTs use **HS256 only**, a server-only random secret, mandatory issuer,
audience, canonical UUID `sub`/`sid`/`jti`, integer `iat`/`nbf`/`exp`, and type `access`.
Lifetime defaults to900 seconds; maximum encoded token size is4096 characters.
Every protected request also checks account status, family expiry and revocation.
JWT signature validation is never bypassed. Authenticated application UUIDs come
from the verified subject and persisted relationship, not an untrusted email/body ID.

Refresh/action credentials contain32 cryptographically random bytes; only SHA-256
digests are stored. Refresh families expire30 days after login and do not slide
indefinitely. Account→family→token row locks serialize rotation; only one concurrent
rotation succeeds. A replay commits revocation before returning401, including the
successor from a concurrent winner. Mobile single-flight avoids ordinary duplicate
rotation. Uncertain/lost rotations require sign-in rather than replaying an old token.
Verification expires after30 minutes; reset after15 minutes. Tokens are single-use
and purpose-bound. Password reset does not silently verify email.

Database counters persist through429/401 errors and process restarts. Limits per
15-minute window: registration5/identity and25/client; login10/identity and50/client;
issuance3/identity and15/client; refresh30/token and150/client; password change5/account
and25/client; action consumption20/client; logout60/client. Counters use atomic
PostgreSQL UPSERT and HMAC bucket identifiers; expired buckets older than one day
are removed during limiter activity. Identity is checked before the client bucket,
so an already-exhausted identity is rejected without incrementing its client bucket.
These are MVP controls, not a complete volumetric DDoS defense. Counter cardinality,
old session/action retention and database load need operational monitoring/retention.

The default trusted-proxy list is empty and Uvicorn proxy-header rewriting is disabled.
Until exact proxy networks are verified, throttling uses the immediate peer; Render
users can consequently share a client bucket. Never trust all CIDRs or arbitrary
X-Forwarded-For. Configure only verified immediate proxies; parsing is bounded to5 hops.

## Email delivery and ₹0 hosting

A `Delivery` interface has SMTP-over-verified-TLS and Resend-HTTPS adapters. No raw
action token is returned by a public endpoint, placed in logs, or written to a debug
outbox. Tests inject an in-memory adapter only; runtime exposes no test delivery mode.
Links are fixed `provia:///verify-email?token=...` and `provia:///reset-password?token=...`;
clients cannot select a redirect URL. Incoming route tokens are captured in memory,
cleared from route parameters and never consumed automatically on screen mount.

**Real email delivery is NOT CONFIGURED or VERIFIED.** Missing provider configuration
returns503 before looking up an address. A configured provider that fails sending
rolls back unsent issuance inside a savepoint and returns the same generic202 for
known/unknown addresses. A202 is an anti-enumeration acknowledgment, not delivery
confirmation. No account is marked verified unless the valid action is consumed.
Synchronous provider latency can still differ for known/unknown addresses; the generic
messages and rate limits do not establish perfect timing anonymity. Provider acceptance
followed by a database commit failure can produce an unusable link; request a new one.

[Render Free blocks SMTP ports25/465/587](https://render.com/docs/free), so use the
optional HTTPS adapter there rather than upgrading hosting. Resend advertises a
[Free plan](https://resend.com/pricing) with3000 emails/month and100/day. No account,
paid plan, billing setup or real send was created by this work. A sending-only API
key and permitted sender must be configured privately. Its test `resend.dev` sender
[only permits the account owner's recipient](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain);
arbitrary users require a verified owned domain. No domain purchase is authorized.
Without an existing permitted sender, public enrollment remains blocked at ₹0.
Use plain-text messages and disable link/open tracking for credential emails.

The HTTPS adapter uses the [official fixed send endpoint](https://resend.com/docs/api-reference/emails/send-email),
verified TLS,5-second network timeouts, no redirects, no automatic retry and no provider
response logging. Rejected/quota-limited/malformed responses fail safely. Production
delivery, DNS, spam handling and email-client deep-link behavior still need testing.

## Mobile screens and navigation

Public group: Welcome, Login, Register, Verify Email, Forgot Password and Reset
Password. Signed-in account screen: identity, verification, change password, session
list/revocation, logout and logout-all. Existing onboarding is reused in its route
group; six authenticated tabs are Dashboard, Nutrition, Workouts, Tracking, Progress
and Profile. Food search and a safe unknown-route fallback are included.

Root waits for session restoration before navigation. Signed-out→Welcome;
pending→verification; verified without profile/active goal→existing onboarding;
returning user with both→Dashboard. Backend verification remains authoritative even
if mobile navigation is bypassed. Password input stays masked with visibility toggles
on login/registration/reset; forms retain drafts on ordinary errors.

Refresh credentials and a rotation marker use expo-secure-store; access tokens stay
in memory. Storage writes are serialized, generation checks discard late account
responses, and the provider remounts account-scoped API state on identity changes.
The marker is written before refresh so a crash cannot replay an uncertain credential.
Session restoration tolerates90-second backend startup, while its waiting screen
terminates at30 seconds with a wait/retry state. Offline/timeout/401/403/database/
configuration/invalid-response categories remain distinct. Diagnostics include only
allowlisted route templates, status, phase, elapsed time and sanitized request IDs.

Logout attempts server revocation even if local deletion fails. A signed-out recovery
action retries unresolved cleanup/revocation. If both secure storage and the network
fail, persisted logout cannot be guaranteed until that retry succeeds; the UI says so.
Refresh failures/disabled sessions terminate restoration rather than looping. Final
401/disabled403 responses clear only the current account generation. Cancellation
or timeout during a shared refresh does not sign out the account or replay rotation.
Failed logout-all requests retain an explicit error rather than implying all devices
were revoked. Mutations
are never automatically retried after an uncertain response. No passwords use AsyncStorage.

Fitness foundations read existing APIs: daily calories/macros and measured weight,
meal sections/catalog navigation, plans/exercises/history, recorded water/activity/
sleep,7-day weight/nutrition/workout/water summaries and profile/goals. Workout Start
creates one unplanned in-progress session, with a lost-response stop and history refresh;
it does not claim sets or completion. Today’s schedule preview covers the five recent
plans loaded, not an exhaustive plan search. Detailed meal entry/workout-set editing,
completion/cancellation and device synchronization remain later UI work. The backend
features themselves are retained. Unknown measurements remain distinct from zero.

## Clerk removal and preserved configuration

Removed runtime provider/JWKS validator, hosted-auth screens/hooks/token cache,
callback rewriting, native config plugin, publishable-key requirement, provider-only
verification script and obsolete provisioning helpers. Removed direct dependencies
`@clerk/expo`, `expo-auth-session`, `expo-web-browser` and `expo-crypto`, with their
unused transitive dependencies. Searches find no Clerk references in active app,
backend scripts/tests, dependency manifests/lockfile or runtime configuration.

Generated Android prebuild has no Clerk callback filter and retains `provia` and
`com.provia.app`. EAS owner `dhyan_mehta`, project ID
`4e131be3-7394-4883-ae44-498c63bfcac5`, APK profiles and signing identity are retained.
No EAS credentials command was run. Old installed/deployed builds, live environment
credentials and ignored local obsolete variables are retained for controlled cutover.
The current exported bundle contains no old publishable key. Historical docs/migration
columns may describe Clerk; they are not a runtime dependency. **Cutover is pending.**

## Required private environment settings

| Setting | Value/purpose |
| --- | --- |
| `DATABASE_URL` | Existing approved pooled Neon URL with TLS, server only |
| `DIRECT_DATABASE_URL` | Existing direct URL; operator migration only, not Render runtime |
| `AUTH_JWT_SECRET` | At least32 random bytes; recommended48; server secret only |
| `AUTH_TOKEN_ISSUER` | `https://provia-mag7.onrender.com` |
| `AUTH_TOKEN_AUDIENCE` | `provia-mobile` (mandatory, not a JWKS URL) |
| `AUTH_ACCESS_SECONDS` / `AUTH_REFRESH_DAYS` | `900` / `30` |
| `AUTH_TRUSTED_PROXY_CIDRS` | `[]` until verified exact proxy ranges are known |
| `AUTH_EMAIL_PROVIDER` | `resend` on Render Free; `smtp` only where permitted |
| `RESEND_API_KEY` / `RESEND_FROM` | Sending-only key and verified/permitted sender |
| `SMTP_HOST/PORT/USERNAME/PASSWORD/FROM` | Optional alternative; verified TLS;465 or STARTTLS |
| `EXPO_PUBLIC_API_URL` | `https://provia-mag7.onrender.com/api/v1`; only public mobile requirement |

Keep existing nutrition/provider/CORS settings. No signer/email/database secret belongs
in `EXPO_PUBLIC_*`. Missing/weak signer configuration fails closed. A fresh local signer
was generated only in ignored `.env`; no existing live secret was removed or rotated.
Changing the signer immediately invalidates access JWTs and changes rate-limit bucket
keys; opaque refresh credentials remain usable unless families are separately revoked.
On compromise revoke affected/all families through a separately approved operator
procedure. Never print secrets into logs or commit them.

## Approved-operator cutover steps (NOT executed)

1. Review this branch, unresolved legacy enrollment and dependency risks. Take an
   authorized private database backup and verify restore access. Coordinate a
   maintenance/cutover window: old Clerk APK tokens will not authenticate to this backend.
2. Configure a free permitted email sender privately and verify real verification/reset
   delivery with controlled test accounts. Provider setup is not proof of delivery.
3. Obtain explicit database-migration approval. From `services/api`, using the existing
   approved environment and intended direct development connection:

   ```powershell
   python -m uv run --no-sync alembic current
   # Only after approval and backup; expected previous revision0004:
   python -m uv run --no-sync alembic upgrade 0005
   python -m uv run --no-sync alembic current
   python -m uv run --no-sync alembic check
   ```

4. Separately obtain Render deployment approval. Merge/push reviewed changes through
   the authorized repository workflow or select the approved branch manually. Existing
   blueprint remains `plan: free`, auto-deploy off and no new database. Build:
   `bash scripts/render_build.sh`; start:
   `.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port $PORT --no-access-log --no-proxy-headers`.
   Enter the private settings above in Render. Health `/health/db` checks connectivity,
   not migration/auth/email readiness; independently verify0005 and auth endpoints.
   Retain obsolete live credentials until rollback is no longer needed.
5. Verify liveness/database readiness and controlled registration→email→verification→
   login→fitness reads→refresh→logout. Check missing/invalid bearer401, disabled403,
   cross-user404 and immediate session revocation. Record only safe status/request IDs.
6. After backend acceptance, obtain explicit APK-build approval. From `apps/mobile`,
   with only the public API URL set in the EAS preview environment:

   ```powershell
   npm run verify:release
   npx eas-cli@latest build --platform android --profile preview
   ```

   This is the exact **manual** rebuild command; it was not submitted. Preview is
   internal, `developmentClient:false`, `buildType:apk`. Reuse existing project/signing.
7. Install the approved APK as an update; do not clear/uninstall app data. On the A35,
   verify cold/warm email links, registration errors, real verification/reset, login,
   process restart, refresh expiry/replay/logout, offline/network recovery, onboarding,
   dashboard and every tab. Keep raw tokens, passwords and health records out of logs.
   No physical-device success is claimed by this report.

## Rollback

Before deployment, reverting this branch leaves the live system unchanged. After a
cutover, stop new auth writes and roll the backend/mobile pair back together to the
approved prior commit/build, retaining old provider configuration. **Keep0005 tables**;
old code ignores them. Do not downgrade/delete populated auth tables in a live database:
doing so destroys first-party credentials/session history even though fitness rows
survive. New first-party accounts do not automatically become old-provider accounts.
Preserve backups and new UUID links; prefer a forward repair and explicit account
enrollment. Never restore an old database snapshot over newer fitness data casually.
Full downgrade/upgrade testing here occurs only in generated disposable test schemas.

## Verification evidence

| Check | Actual result |
| --- | --- |
| Complete backend suite | **243 passed**,0 failures/errors/skips,882.51seconds |
| Real PostgreSQL subset | **44 passed** within that full run; generated DB removed in finally |
| Backend nonintegration subset |199 passed within the full run |
| Security mutation check | Inverted JWT type guard made tests fail; original bytes restored;38 targeted security/email/header tests then passed |
| Ruff lint and formatting | PASS;100 files formatted |
| Mobile tests | **95 passed**,9 suites,0 failed/pending |
| Mobile TypeScript and ESLint | PASS |
| Expo Doctor | **20/20 PASS** |
| API artifacts | Export check, TypeScript generation check and contract typecheck PASS;60 paths |
| Incremental migrations |0004→0005 data preservation, downgrade preservation, full roundtrip and metadata drift PASS in disposable PostgreSQL |
| Existing application DB | Read-only check: **0004**, no auth tables; not migrated |
| Android prebuild | PASS; provider callback absent, PROVIA scheme/package retained |
| Android Hermes export | PASS; local bundle, not an APK/device test |
| Release/static config guards | PASS; EAS preview remains standalone APK, Render Free/auto-deploy-off retained |
| Backend audit |77 locked runtime dependencies, no known vulnerabilities |
| Mobile audit/signatures |5 high reports retained as described below;1307 signatures and315 attestations verified |
| Credential/bundle scan | PASS; no configured server-secret matches, obsolete public key absent from bundle |

Commands ran from their owning packages. Backend execution used
`python -m uv run --no-sync`, including:

```powershell
python -m uv run --no-sync python -m scripts.run_postgres_tests --junitxml=.pytest_cache/first-party-auth-release.xml
python -m uv run --no-sync ruff check app scripts tests alembic
python -m uv run --no-sync ruff format --check app scripts tests alembic
python -m uv run --no-sync python -m scripts.export_openapi --check
```

Mobile: `npm run typecheck`, `npm run lint`, `npm test -- --silent`,
`npm exec --yes expo-doctor`, `npm exec expo -- prebuild --platform android --no-install`,
`npm exec expo -- export --platform android --output-dir dist --clear`,
`npm run verify:release`, `npm audit --json`, `npm audit signatures`.
Contracts: `npm run check` and `npm run typecheck`. Root static/credential checks:
`node scripts/check-sprint-config.mjs` and `node scripts/scan-sprint-secrets.mjs`.
Backend pip-audit ran separately against an exported locked requirement list using
the approved interpreter; it did not sync or replace the project environment.

The31 tests in new backend auth/security/email files cover registration, duplicate
email, verification/replay/expiry, reset/change revocation, persisted limits, legacy
collision, concurrent registration/refresh, reset/login races, disabled/pending/expired
identities and provider failures. Existing business regressions remain; old provider
verification tests were replaced by first-party JWT/dependency tests, so totals are
not simply the old233 plus new files. Mobile coverage adds forms/redirects, returning
users, secure storage, lost rotations, logout failures, stale/cancelled requests,
disabled accounts, skeleton data states and uncertain workout start. Native controls
and HTTP transports are mocked in component/unit tests; this is not device UI evidence.
One intermediate PostgreSQL run encountered a transient DNS setup failure; the complete
final rerun passed all243 without suppressing, skipping or retrying assertions.

Security review identified and corrected password-reset/login races, error-path
rollback of replay revocation/counters, outstanding-reset invalidation, configured
email-failure enumeration, mounted-screen link handling, and logout storage-failure
recovery. Reviews were read-only; automated tests supply execution evidence.

## Dependency audit and remaining release limitations

The isolated pip-audit of77 locked runtime dependencies found **no known vulnerabilities**.
No project dependency sync or SQLAlchemy wheel replacement occurred. SQLAlchemy2.1.6
still reports `HAS_CYEXTENSION=False` under Python3.12.15.

npm audit reports **5 high,0 critical** affected-package entries from two upstream
advisories: [node-forge signature verification](https://github.com/advisories/GHSA-86w9-cpqp-85rv)
and [Zod constrained collection memory exhaustion](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5),
propagating through Expo CLI/certificate tooling/Expo. Installed node-forge1.4.0 is
the latest published version checked; Zod3.25.76 is required by the current CLI/lint
chain and the patched4.6.7 is a major migration. No forced override or unsupported
Expo44 downgrade was applied. Application auth does not import either dependency;
they remain reachable in development/build tooling, including certificate processing
and config validation. This is a **deferred build-tooling risk, not a clean audit**.
Do not process untrusted certificates/configs or approve a production release until
upstream-compatible remediation or explicit reviewed risk acceptance. Recheck by
**2 November2026**, and before any cloud build. All1307 installed packages had verified
npm registry signatures;315 had attestations. These checks do not prove absence of
unknown vulnerabilities or compromise.

Email delivery/sender ownership, legacy-user enrollment, deployed migration/auth,
new APK and real-device behavior remain unverified. Render Free has cold starts and
service limits; persistent login requires network, and uncertain rotation deliberately
requires reauthentication. No MFA, email-change credential flow, admin enrollment UI,
volumetric edge defense or production retention job is included. Indian-food catalog
licensing/coverage remains a separate unresolved external dependency.

## Release status

Implementation is committed only after the checks above. The exact resulting commit
hash is supplied in the completion message and can be read with `git rev-parse HEAD`.

```text
FIRST-PARTY AUTH BACKEND — PARTIAL
NEON DATABASE MIGRATIONS — READY
MOBILE AUTH — PARTIAL
CLERK REMOVAL — PENDING CUTOVER
FITNESS SKELETON SCREENS — PASS
SECURITY TESTS — PASS
RENDER DEPLOYMENT — PENDING USER APPROVAL
EAS APK BUILD — PENDING USER APPROVAL
REAL DEVICE TEST — NOT VERIFIED
```

PARTIAL reflects real email/sender setup, legacy enrollment and live/device acceptance,
not hidden passing claims. No Render deployment, EAS cloud build, existing-database
migration, live credential rotation/removal, or phone-data reset was performed.
