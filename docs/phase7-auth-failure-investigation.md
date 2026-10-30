# Phase 7 authentication failure investigation

30 October 2026, Asia/Calcutta. Starting revision
`f5aace0d84bafbfe9ed81f15f1d9c327ac3bd37f`, branch `codex/first-party-auth`.
Authentication acceptance is **BLOCKED**. This investigation used read-only public
HTTP/schema checks and local operator configuration/schema probes. No registration,
mail sending, live configuration change, deployment or application migration was run.

## Incident versus current reproducible evidence

The user clarified that the 29 October failure occurred during registration after
building/updating the phone application. The exact installed build ID, APK hash,
embedded API URL, visible error and request ID have not been supplied for that
incident. Whether the attempted request reached Render is unproven. Do not attribute
that historical incident conclusively to a particular HTTP response or storage error.
The earlier downloaded Clerk-preview APK is not established as the later updated APK.

The repository currently implements first-party auth. `AuthProvider` uses native
`expo-secure-store`; `createAuthSession` POSTs `/api/v1/auth/login` and
`/api/v1/auth/refresh`. Registration uses `/api/v1/auth/register`, requiring the
encrypted outbox, first-party schema and supervised email worker. The expected
configured hosted base is `https://provia-mag7.onrender.com/api/v1`.

## Current deployed compatibility — confirmed blocker

A public read-only GET `https://provia-mag7.onrender.com/openapi.json` returned200:

| Probe | Observed result |
| --- | --- |
| Paths / operations |47 /67, compared with frozen local67 /91 |
| `/api/v1/auth/register` |Absent |
| `/api/v1/auth/login` |Absent |
| `/api/v1/onboarding` |Absent |
| `/api/v1/progress/overview` |Present; its presence alone does not imply Phase4 completeness |
| Security scheme |HTTPBearer; no first-party authentication tag |

This confirms the hosted contract cannot satisfy the current first-party client.
It is consistent with the older backend. Public OpenAPI does not expose the deployed
Git SHA or prove which exact internal authentication implementation is running;
HTTPBearer alone cannot establish Clerk. No actual registration POST was sent to
the live service during this audit. An absent schema route is contract evidence,
not a fabricated observed registration404.

## Deployed smoke — actual request results

Command: `node scripts/check-sprint-backend.mjs https://provia-mag7.onrender.com/api/v1`.
Initial sandbox transport failures were retried with approved network access.
The first authorized run returned health200 after42734ms, a transport/protocol
failure for `/health/db`, and401 for both unauthenticated and deliberately invalid
bearer `/me`. Delay alone does not establish a Render cold start. One bounded retry
then passed all four requests:

| Request | HTTP / safe category | Duration | Request ID |
| --- | --- | --- | --- |
| GET `/health` |200 EXPECTED |681ms |1946fa14-5620-4ec4-9e3f-766555ac946e |
| GET `/health/db` |200 EXPECTED |827ms |2d642113-b1d4-466d-a6dd-89f875d5288e |
| GET `/me` anonymous |401 EXPECTED |239ms |9802a7ce-c140-4a46-866f-ac8ed7a7d055 |
| GET `/me` deliberately invalid bearer |401 EXPECTED |147ms |249d03fb-52b6-48bd-b38b-caaefd42b6a6 |

No real bearer was used. Smoke PASS is liveness/database/denial evidence; it does
not prove first-party registration, verification, login or schema compatibility.

## Configured application database and local mail configuration

Existing read-only `scripts.verify_auth_readiness` and `scripts.auth_email_status`
ran under `python -m uv run --no-sync`. A separate SELECT of `alembic_version`
confirmed the locally configured application database remains **0004**. No schema
or application records changed. This local target is not independently proven to
be the database currently configured inside Render; do not equate their credentials.

| Local operator check | Actual result |
| --- | --- |
| Signing configuration |PASS |
| Email provider configuration |BLOCKED: missing or invalid |
| Outbox encryption |BLOCKED: missing or invalid |
| Worker enabled |BLOCKED: disabled |
| Intake configured |Enabled, but prerequisites above remain blocked |
| Expected0007 / auth tables |Revision mismatch; required auth tables absent |
| Aggregate outbox status |BLOCKED: outbox schema unavailable |
| Real provider acceptance / inbox / reset email |NOT VERIFIED |

No secret values, account addresses, tokens, ciphertext, password hashes or health
records were printed. Local settings do not reveal Render's current private mail,
worker or encryption configuration. Inbox receipt is not established by any202.

## Source behavior and correction requirements

Registration validates the JWT signer and outbox encryption before enqueueing.
It creates a generic202 encrypted intent; account creation/eligibility and real mail
occur later in the worker. Provider failure remains sanitized `EMAIL_UNAVAILABLE`503.
Login needs existing first-party account/session tables. Verification/reset links use
`provia:///verify-email` and `provia:///reset-password` with explicit confirmation.
Refresh rotates opaque credentials and persists a pre-request marker; no bypass or
replacement session controller is justified by these infrastructure findings.

No backend business-code fix or security relaxation resolves the missing deployed
routes/schema. The required remedy is the already documented controlled cutover:

1. Identify the exact failed APK/build and safely correlate its registration attempt
   with Render status/error/request ID. Inspect its public API URL without logging tokens.
2. Obtain approval for encrypted backup and a demonstrated restore to a separate target.
3. Verify the intended application database, then separately approve0005→0006→0007.
4. Approve publication and deployment of the reviewed matching first-party backend.
5. Privately configure approved Resend sender/key, encryption ring and worker/intake
   activation. Preserve existing signer, records and security validation.
6. Approve a dedicated actual inbox/account and controlled registration/reset delivery
   tests; record provider acceptance and inbox arrival separately.
7. Use a matching native build to exercise registration, real verification, login,
   onboarding, dashboard, persistence/restart and logout on Android.

The Phase3/Phase6 deployment runbooks specify exact commands and approval boundaries.
Do not migrate, deploy or activate mail merely to change this report to PASS.

The coordinator's actual browser inspection reproduced welcome/session-restoration
failure, empty-field registration validation and a generic login error with synthetic
`.invalid` credentials. The native SecureStore web module lacks the invoked deletion
operation; `signIn` calls `forget`/storage cleanup before its HTTP login request.
Consequently that browser attempt can fail before login HTTP, independently of the
deployed missing route. No real mailbox or verification action was used. Detailed
browser evidence belongs to `phase7-browser-e2e-evidence.md`.
This separate Expo Web limitation must not be relabeled as the confirmed root cause of
the phone incident. Required native persistence and real-inbox evidence remain
missing, so the Phase7 authentication gate is not satisfied. Health Connect
implementation must remain stopped until that gate passes.
