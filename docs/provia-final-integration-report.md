# PROVIA final integration evidence

1 November 2026. Source implementation commit: `460c328c4ee3e165f27103e1cf9ceb9c8457b8b0`.
This report separates local verification, live database changes and physical-device acceptance.

## Database and deployment

- Authenticated Neon CLI metadata matched the local direct endpoint to exactly one existing project/branch. Render's actual `DATABASE_URL` and `DIRECT_DATABASE_URL` were privately fingerprinted against the local host, database and role; both matched. Connection strings were not printed or committed.
- PostgreSQL 18 initially reported revision `0004`: four exercise catalog rows, zero rows in every other application table. No users, historical Clerk accounts or fitness history were present.
- The operator explicitly approved preserving the four exercise records while applying the existing additive migrations after identity verification.
- The existing Alembic launcher now executed successfully outside the filesystem sandbox. No alternate launcher, binary replacement or Windows security change was used. An initial sandbox attempt encountered uv cache permission failures; the approved normal execution returned sole head `0007`.
- Executed the existing `0004 → 0005 → 0006 → 0007` chain against the verified application database with 5-second lock and 120-second statement timeouts. No migrations were edited, stamped or improvised.
- Final `alembic current`: **`0007 (head)`**. Final `alembic check`: **No new upgrade operations detected**. The new auth, encrypted email outbox and request receipt tables exist; model comparison includes weight provenance, constraints, relationships and indexes.
- Complete-row exercise fingerprints match before/after: all four existing records are unchanged. Final counts remain four exercises, zero rows in every other application table. No backup, restore, reset, deletion or database creation occurred against the application database.
- Actual Render service: existing PROVIA Free service at `https://provia-mag7.onrender.com`, repository `DhyanMehta/PROVIA`, branch `main`, last successful commit **`30c9717a889b05515b98437239dacada21de8a18`**. Root is `services/api/`; build command is `bash scripts/render_build.sh`.
- Its current start command lacks the reviewed `--no-proxy-headers` flag. After the operator privately saved configuration, browser inspection validated signing-secret length/diversity, independent valid Fernet JSON key ring, issuer/audience correspondence, bounded lifetimes/poll interval, empty proxy trust, Resend provider, API-key format and the official test-sender mailbox. Email requests are explicitly false. **`AUTH_EMAIL_WORKER_ENABLED` is absent**, rather than explicitly false; the current source default is false. Add the explicit false setting during approved staging configuration. No linked environment group was listed. Values were remasked immediately and never written to diagnostics or this report.
- **No Render deployment, branch change, Git push or email activation was performed.** A fresh HTTP 200 read of live `/openapi.json` confirmed **47 paths/67 operations** and **no `/api/v1/auth/register`**. Current source has 67 paths/91 operations; live compatibility fails.

Post-migration public read-only smoke passed:

| Request | Result | Duration | Request ID |
| --- | --- | --- | --- |
| GET `/api/v1/health` | 200 | 32,695 ms | `a2f05701-4fc1-41cc-b933-194c3ff8fe03` |
| GET `/api/v1/health/db` | 200 | 981 ms | `48576b5c-075d-4c89-9b94-8e61b9ccbe7f` |
| GET `/api/v1/me`, anonymous | 401 | 121 ms | `292d713c-c051-406a-a15f-6de5df190b20` |
| GET `/api/v1/me`, deliberately invalid bearer | 401 | 114 ms | `65d1fb16-b073-41ff-bbc3-f32ad9e2e623` |

An earlier smoke attempt had a transport failure for database readiness; the bounded post-migration run above passed. A slow health response alone does not prove a cold start. These checks do not verify a real first-party session.

## Authentication and browser evidence

The phone's reported registration 404 has a confirmed endpoint mismatch: the actual deployed OpenAPI schema lacks first-party registration, and its revision predates that implementation. The original request's complete log trace was not recovered. Historical EAS build `87fa2c39-5f1c-4ad0-8e93-258d1c491afa` points to source `fc583874…`, consistent with the user's build description; the installed APK's exact hash was not established.

Auth-route 404 errors now explain the missing sign-in service/version mismatch while retaining safe status/request-ID diagnostics. Ordinary record 404 messages remain unchanged. Web login explicitly explains the native SecureStore requirement and disables unsupported submission; no fake storage or authenticated state was introduced.

Actual browser: Codex in-app browser, `http://localhost:8091/login`, current local source. The native-storage explanation and disabled web sign-in were rendered and inspected. Genuine screenshot: `apps/mobile/.expo/final-evidence/login-platform.png` (ignored local evidence). Browser navigation to the separate privacy preview later became unavailable; that route was stopped. No complete browser console/network acceptance or authenticated visual journey is claimed. Registration, verification, onboarding and dashboard visual acceptance remain pending native access and the matching backend.

The operator explicitly authorized the email address shown in the signed-in Resend profile for signup, verification and reset tests; the address is not reproduced here. No real Resend message was sent, received or verified. Actual account inspection confirmed Free transactional limits (0/3,000 monthly and 0/100 daily), paid overage disabled, no verified domains and no sent emails. The saved key matches the visible PROVIA key prefix; the dashboard key has Full access, broader than needed. Prefix/format matching does not prove full-key authorization. The configured official `resend.dev` test sender can deliver only to the Resend account address; delivery to arbitrary recipients requires a verified owned domain. No key permissions, credentials or account settings were changed.

The local preflight had signer/schema PASS but email/encryption BLOCKED and worker disabled; local settings do not establish saved Render validity. A later local diagnostic reported a dotenv syntax warning at line 37; its content was not printed or modified. The HTTP harness uses a controlled mail sink, not delivery evidence. Render Free can sleep; no always-on email-worker SLA is claimed. Real provider/inbox acceptance remains pending explicit activation approval.

## Android and Health Connect

One explicitly authorized free EAS preview build was submitted, using the existing EAS project and remote Android keystore:

- Build ID: `22a1d1a9-53fc-404a-8fb6-5fc5f3dfe197`.
- [Actual EAS build](https://expo.dev/accounts/dhyan_mehta/projects/provia/builds/22a1d1a9-53fc-404a-8fb6-5fc5f3dfe197).
- Source: `460c328c4ee3e165f27103e1cf9ceb9c8457b8b0`.
- Final status: **FINISHED**. APK downloaded to ignored `apps/mobile/.expo/final-provia-preview.apk`, 133,531,720 bytes. SHA256: `30db1103530d2260687dfbed7bf959253f96b2d4785632a36a6db79a4bc4b7f1`.
- Actual APK archive inspection found the application package, standalone privacy activity, permissions-rationale action and all three Health Connect read permissions. This static inspection does not prove native runtime behavior or phone installation.
- Package `com.provia.app`, scheme `provia`, version `0.1.0`, version code 1 and existing signing credentials preserved. No second build submitted.

New dependency: `react-native-health-connect` **4.1.3**. Expo-compatible patches aligned: Expo `~58.0.22`, `@expo/ui ~58.0.26`, build-properties `~58.0.12`, dev-client `~58.0.18`, router `~58.0.29`, screens `~4.30.1`; React Native remains `0.88.1`. SDK compatibility checks passed; APK compilation/device acceptance is separate.

Implemented manual foreground Health Connect integration:

- Availability, initialization, explicit per-category permission requests/rechecks and permission management. Read permissions only: steps, weight and sleep. No background sync, health writes, distance, calorie or exercise import.
- Provider-aggregated steps; missing aggregate contributors remain unknown rather than silently becoming zero. Weight uses actual kilograms and stable record IDs. Sleep uses actual sessions/stages and half-open wake-day bounds.
- Profile-timezone completed-day boundaries, including DST; UI selects yesterday. Reads are bounded by page limits, repeated-cursor checks and deadlines. Incomplete reads are never uploaded as completed snapshots.
- Account-scoped encrypted identity metadata, stable receipt IDs, confirmed backend persistence, replay suppression, partial-failure reporting, permission/session rechecks, logout/account-switch/background cancellation and query invalidation.
- Weight/sleep replay honors deleted receipt resources. Existing activity snapshots are never overwritten by sync: same snapshots are skipped and changed snapshots require manual conflict resolution. Manual/richer/foreign/unknown activity snapshots are protected.
- Initial activity import requires explicit confirmation of one authoritative client/day and no intentional prior deletion. The frozen API lacks an atomic create-only activity operation and durable activity deletion tombstone: a GET→PUT race or missing local metadata after reinstall cannot be fully solved client-side. Multi-device merge is not claimed.
- Generated manifest inspection confirmed exactly the three read permissions and a standalone signed-out native privacy activity for the permissions rationale/Android 14 alias. Config plugins generate native code; generated Android files were not hand-edited.

**Health Connect classification: implemented source, physical-device verification pending.** Native permission dialogs, real provider readings, cancellation and persisted device-to-server sync have not been tested on the Samsung A35. No phone data was cleared or modified. No local Gradle build was claimed from Windows' unavailable suitable SDK/JDK.

## Indian nutrition

Measured food-specific portions now offer quarter, half, one, one-and-a-half and double quantities, retaining exact existing decimal/HALF_UP calculations and backend portion IDs. Roti/katori amounts use each record's actual gram conversion; custom grams remain supported. No universal household conversion was introduced.

Custom food/recipe guidance supports aliases for the same preparation across English, Hinglish, Hindi and Gujarati, measured cooked yield, ingredients/oil and per-recipe portions. Different preparations are not assigned identical nutrition. Existing formulas, unknown nutrient behavior and historical snapshots remain intact.

**New verified Indian catalog records imported: 0.** USDA's official CC0 terms were verified; existing USDA and Open Food Facts integrations remain intact. Available IFCT/NIN material was not imported because legally reusable redistribution permission was not established. Indian catalog coverage therefore remains partial. Custom measured portions are implemented and tested; this does not establish broad verified catalog coverage.

## Verification

| Check | Actual result |
| --- | --- |
| Mobile Jest | **353 passed, 29 suites, 0 failed**; original tests retained |
| TypeScript / ESLint | PASS |
| Expo Doctor | **20/20 PASS** after compatible patch alignment |
| Android prebuild / Hermes export | PASS; Android bundle generated (5.8 MB); not APK/device acceptance |
| Release configuration validation | PASS; actual backend compatibility remains separate |
| API contract typecheck/export/inventory | PASS; frozen 67 paths/91 operations |
| Backend Ruff lint / format | Latest checks PASS; 128 files already formatted |
| Real FastAPI/PostgreSQL HTTP harness | **32/32 checkpoints, 82 requests**; owned disposable database migrated to 0007 and removed |
| Harness HTTP status distribution | 200×43, 201×22, 202×2, 204×2, 401×3, 404×7, 409×3 |
| Live database migration/current/drift/preservation | PASS, actual application database 0007 |
| Post-migration public backend smoke | 4/4 PASS, older deployed revision |
| Credential scan before source commit | 0 matches across 23 changed source files |
| Final credential scan | 0 matches across 442 candidate/bundle files, including 29 bundle files |
| Git whitespace | PASS |
| Full backend collection | **424 collected: 423 passed, 1 setup error**, 1,583.39 seconds. Error was transient DNS resolution before test assertions. The affected session/logout/isolation test **passed on targeted retry** in a separate fresh database (30.69 seconds). Both databases removed; no clean single-run 424-pass result is claimed |
| PostgreSQL integration subset | 76 collected: 75 passed in full run; the remaining test passed on targeted retry |
| npm audit | **46 advisory entries: 1 high, 44 moderate, 1 low, 0 critical**; not clean |

The expanded HTTP harness invokes the actual sync coordinator and real server/database with controlled native readings and an in-memory ledger. It checks import/replay, dashboard totals, actual weight deletion and suppression of recreation; it does not establish native Health Connect or real mail delivery. An initial harness placement error and an outdated permanently-disabled Health Connect screen assertion were corrected before the final complete passing runs. Focused test counts overlap the 353 total.

Audit includes a high Zod advisory in the Expo CLI chain; an unreviewed major Zod override was not forced. Other advisory chains include build/test/lint dependencies. No direct Health Connect advisory entry was reported. No claim is made that dependency risk is resolved.

## Neon agent setup and configuration changes

Fetched and followed the exact requested [Neon skill](https://neon.com/.well-known/agent-skills/neon/SKILL.md) and official agent setup instructions. Reused installed Neon CLI 8.4.5. User completed the existing default-profile login privately. Ran the official `neon plugins --global --agent codex -y` installer; the enabled user plugin supplies Neon skills and MCP configuration at `https://mcp.neon.tech` (plugin 2.3.0). No duplicate project MCP configuration or credentials were created. A subsequent agent restart is needed to expose newly installed MCP tools; the authenticated CLI worked in this session.

Linked the verified existing project/branch using `--no-env-pull --no-config`. This created ignored local `.neon` context and added `.neon` to root `.gitignore`. Existing backend `.env` and mobile `.env.local` hashes were unchanged. No `neon.ts`, new cloud resource, branch, auth replacement or environment pull was introduced.

## Changes and coordination

Source commit changes 23 files: mobile app/dependency configuration; native privacy plugin/route; Health Connect native adapter, coordinator, screen and tests; safe API error message and auth platform handling/tests; measured nutrition UI/guidance/tests; and the real HTTP integration driver. Backend business code, migrations and generated contracts are unchanged. This report and the `.neon` ignore entry are the subsequent documentation/configuration changes.

Actual subagents: `final_database` investigated read-only identity checks (its interrupted query produced no new evidence; the coordinator completed live checks); `final_indian` implemented nutrition improvements; `final_health` implemented native/sync source; `final_health_review` independently reviewed security and replay behavior. The latter two hit usage limits after delivering saved work; the coordinator completed fixes and verification. No worker output substitutes for device acceptance.

## Remaining operator actions

1. Obtain approval to publish the reviewed local source to `DhyanMehta/PROVIA` on `codex/first-party-auth`, configure the existing Render Free service for that exact source with auto-deploy off, add explicit worker=false, use the safe start command and `/api/v1/health/db`, and perform one staged deployment with both email flags false. Remote read-only Git inspection found `main` still at `30c9717` and no published `codex/first-party-auth` branch. No force-push or main merge is planned. API tree hash `b8643e8623d72380a5cee2797b3e4ee7ea3d235f` matches reviewed backend completion commit `ac659910cf1855ae1ee652e0ff8eba445537e3a6`. Verify live 67 paths/91 operations and safe configuration readiness before activation.
2. Separately obtain approval to enable email requests and the same-service worker and send registration/verification/reset messages to the explicitly authorized Resend account inbox. Keep the existing Free plan; no new worker service or paid resource. Narrow the provider key to Sending access through an operator-controlled change where feasible. Never interpret deployment approval as email activation approval.
3. The single EAS build finished and its APK is available. After the matching backend/mail configuration is verified, update the existing phone installation with the same signing identity, retaining phone data. No second build is required merely to add server-side secrets. ADB is not currently available in the execution environment.
4. Run real registration→inbox verification→login→onboarding→dashboard, restart/session restoration, logout/login and password-reset acceptance. Verify meals, workout lifecycle, water, weight, activity, sleep and progress through the installed app.
5. On the Samsung A35, grant/revoke each read permission, verify no-data/partial failure/account-switch behavior, sync yesterday's actual steps/weight/sleep, confirm backend/dashboard totals and replay/deletion handling. Keep activity limited to one authoritative client until server conflict/tombstone support exists.
6. Obtain a licensed, attributable Indian dataset before claiming broad catalog completion. Continue measured personal recipes without fabricated nutrition.

## Acceptance status

| Area | Result | Evidence |
| --- | --- | --- |
| Neon migrated to 0007 | PASS | Actual revision, drift and complete-row preservation checks |
| Backend deployed | BLOCKED | Older `30c9717`; saved configuration validated, staging deployment approval pending |
| Registration | BLOCKED | Real current native UI acceptance pending matching backend/mail |
| Email verification | BLOCKED | No provider/inbox/link acceptance |
| Login | BLOCKED | No real native session acceptance |
| Onboarding | BLOCKED | No authenticated application evidence |
| Android APK | BUILT | EAS FINISHED; downloaded APK size/hash and manifest strings verified |
| Samsung A35 | NOT VERIFIED | No current physical-device evidence |
| Health Connect permissions | NOT VERIFIED | Native permission acceptance pending |
| Steps sync | NOT VERIFIED | Controlled native inputs/real HTTP passed; device evidence pending |
| Weight sync | NOT VERIFIED | Controlled native inputs/real HTTP passed; device evidence pending |
| Sleep sync | NOT VERIFIED | Controlled native inputs/real HTTP passed; device evidence pending |
| Indian food catalog | PARTIAL | Zero new licensed Indian records imported |
| Indian portions | COMPLETE | Measured record-specific fractional quantities tested; catalog coverage separate |
| Browser E2E | PARTIAL | Real login rendering/platform limitation inspected; authenticated journey pending |
| Native E2E | BLOCKED | APK/device/backend/mail acceptance incomplete |
| Overall personal beta | NOT READY | Live backend/auth/email and physical-device gates remain |
