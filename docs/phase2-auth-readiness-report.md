# First-party authentication Phase 2 — readiness and controlled cutover

Review date: 27 October 2026. Branch: `codex/first-party-auth`.
Starting commit: `ceea9d01546cf6efb77cd8014a48c0c381c4c888`; the resulting verified
local commit is identified in the completion message (`git rev-parse HEAD`).
The working tree was clean at the start. No unrelated user changes were reset.

This report is the consolidated Phase 2 handoff. Source readiness, mocked tests,
configuration readiness and real deployment/device acceptance are separate results.
No application migration, deployment, push/merge, cloud APK build, live environment
change, real email send, phone-data reset or paid resource creation was authorized
or performed. The existing Neon application remains at **0004** with no auth tables.

## Initial state and risk assessment

- Revision 0005 exists and adds only the five expected auth tables. Application
  user UUIDs, old provider subjects, fitness relationships and formulas are retained.
- Render blueprint: Python 3.12.15, Free, root `services/api`, manual deployment,
  no managed Render database, no automatic migration, proxy rewriting disabled.
- EAS owner `dhyan_mehta`, project `4e131be3-7394-4883-ae44-498c63bfcac5`, package
  `com.provia.app`, scheme `provia` and preview standalone APK profile are retained.
- Real email/sender verification, legacy enrollment and actual migration/cutover
  remain the principal functional gates. Five npm high affected-package entries
  remain build-tooling risks, not a clean dependency audit.
- The earlier 243 backend/44 PostgreSQL/95 mobile results were historical baseline
  evidence. Fresh Phase 2 results are recorded after integration below.

## Specialist orchestration and findings

Native Codex agents were available and actually used. The environment permits four
active agents including the coordinator, so independent work ran in waves of three
specialists rather than pretending five could run simultaneously. File ownership
was assigned before delegation; shared config/contracts/lockfiles were coordinated.

| Workstream | Native agent | Ownership and result |
| --- | --- | --- |
| A — Authentication security | `/root/backend_review`, resumed by `/root/security_final` | P2 duplicate forwarding-header identity flaw reproduced and fixed; 20 targeted tests pass. Synchronous-mail timing enumeration remains open. |
| B — Neon/migrations | `/root/db_readiness`, final review by `/root/database_final` | No migration/model defect found; preservation/integrity regressions added; guarded backup/restore/rollback runbook reviewed. |
| C — Mobile auth/navigation | `/root/day3_review`, resumed by `/root/mobile_final` | P2 unbounded native-storage waits fixed; serialized writes retained; expiry after simulated resume rotates once. Full mobile suite passes. |
| D — Email/deployment | `/root/email_readiness`, resumed by `/root/email_final` | Single-mailbox/key validation and SMTP cleanup reviewed; mocked delivery and configuration checks, real delivery still unverified. |
| E — Fitness integration | `/root/fitness_readiness`, final review by `/root/fitness_final` | P2 malformed JSON/false workout success and obsolete feature links fixed; history paging added; validators checked against backend contracts. |

The coordinator owns final integration, the read-only readiness command, dependency
audit, generated contracts, full verification, this report and the local commit.
Some earlier specialist calls stalled without results and were interrupted. Resumed
agents inspected the actual filesystem; only returned command results are counted.
The coordinator ran the affected email tests and completed the supporting email
document when the specialist's document-write call did not execute.
After the later interrupted verification run, `/root/unit_verification_resume`
independently ran the complete unit/Ruff/OpenAPI checks; `/root/runbook_resume_review`
checked commands and approval gates read-only. Its two documentation findings were
fixed: local preflight scope is explicit, and post-migration failure guards stop the
operator procedure. The coordinator runs the integration batches sequentially.

## Bugs fixed and files changed

Changes are limited to confirmed defects, regression coverage and readiness
tooling/documentation; the authentication architecture and fitness services remain.

- **P2 proxy identity:** `services/api/app/modules/auth/dependencies.py` requires
  exactly one forwarding header from a trusted immediate peer. Ambiguous duplicate
  fields fall back to that peer. Seven cases in `tests/test_first_party_security.py`
  include the two attacker-controlled identities that failed before the fix; all
  20 targeted security tests pass afterward. Existing bounded, right-to-left chain
  handling remains intact.
- **P2 email configuration:** `app/modules/auth/email.py` validates one bounded
  sender mailbox, rejects control characters/multiple senders and malformed keys,
  explicitly verifies TLS and closes SMTP connections even when STARTTLS fails.
  `tests/test_auth_email.py` covers provider failures and configuration boundaries.
- **P2 native storage:** `apps/mobile/src/lib/auth-session.ts` bounds caller waits
  to ten seconds while keeping the underlying non-cancellable write queue serialized.
  `auth-session.test.ts` covers stuck reads/writes/clears and concurrent refresh
  after a simulated sixteen-minute background interval. A permanently stuck native
  write prevents further persistence safely; it requires native/device investigation,
  rather than allowing a late old credential to overwrite newer cleanup.
- **P2 API/fitness presentation:** new `src/lib/fitness-contracts.ts` and tests validate
  rendered fields without replacing generated types or backend calculations.
  `src/screens/dashboard.tsx`, `fitness.tsx`, `profile.tsx` and `flow.test.tsx` handle
  malformed success bodies, uncertain workout writes, stale summaries and bounded
  workout-history paging. `src/app/next/[section].tsx` routes old feature links to
  real tabs and rejects malformed/unknown keys.
- **Database and operator coverage:** `services/api/tests/integration/test_postgres.py`
  extends preservation/roundtrip coverage and adds integrity/deletion boundaries.
  `services/api/scripts/verify_auth_readiness.py`, `tests/test_auth_readiness.py`, this
  report, `phase2-neon-readiness.md` and `phase2-email-readiness.md` provide sanitized
  readiness checks and controlled-cutover instructions.
- **P2 diagnostic artifacts:** `services/api/scripts/run_postgres_tests.py` now uses
  short tracebacks, redacts configured secrets in JUnit XML text/attributes as well
  as console output, and guards initialization/cleanup errors without claiming
  deletion succeeded. `tests/test_postgres_runner.py` adds five regression cases.
  The ignored DNS-failure artifacts were sanitized without changing their outcomes;
  a private configured-value scan found zero credential matches afterward.

`scripts.verify_auth_readiness` is a new **read-only** operator check. It separately
checks signer configuration, selected email-adapter configuration and revision 0005 /
five-table presence. It never sends email, migrates, registers a user or prints
credentials. Missing schema/configuration returns a nonzero result. Even a green
configuration/schema result explicitly leaves real delivery, legacy enrollment and
deployment/device acceptance unverified; it is not a production certification.
It loads the executing machine's Settings/environment, not Render's live variables.
A local invocation cannot prove Render configuration parity; independently confirm
the approved database target and validate deployed authentication through the
controlled remote checks below. Do not copy server secrets into local files merely
to make the preflight green.

## Database, auth and existing-user readiness

The database specialist found no verified model/migration defect requiring changes
to `auth_models.py` or 0005. It reviewed UUID links, unique normalized email/user links,
purpose/status constraints, FK indexes and nullable timestamps. Existing tables are
not altered and startup/build performs no migration. Measured query history can
justify later composite indexes; speculative index changes were not introduced.

Added tests exercise 0004→0005→0004→0005, preserved legacy UUID/weight records, zero
automatic enrollment, metadata drift, duplicate email/user links, orphan rejection,
token-digest uniqueness, purpose constraints and restricted/cascaded deletion
boundaries. Six targeted real PostgreSQL tests passed in 153.62 seconds; their generated
database was removed. The final full suite includes those checks again.

**There is no automatic legacy-account claim.** A contact email alone never proves
ownership. Registering an address matching an unclaimed legacy record remains
generic and cannot attach to it. New independent accounts receive their own UUIDs;
they cannot access old fitness history. Using another email does not migrate history.
An operator-assisted flow still requires separately proven old-provider subject
ownership, proof of the new email, one-time password enrollment, unique-link checks
and an audited transaction retaining the original UUID. That workflow is not
implemented; do not improvise SQL verification flags or a public admin bypass.
Defer broad legacy-user cutover until it is approved and implemented.

Passwords, access JWTs, rotating refresh families and single-use action hashes retain
the established design. PostgreSQL stores Argon2id password hashes and refresh/action
digests, not plaintext passwords or raw refresh values. Every protected fitness route
uses the verified internal UUID and persisted session/account checks. Existing goal
snapshots, meal calculations and nutrition formulas remain the backend's authority.

**Open P2 security finding — timing enumeration:** registration and recovery/resend
return generic bodies, but eligible addresses invoke synchronous provider delivery
while other addresses do not. An observer can measure that latency difference.
Rate limits constrain abuse but do not eliminate this information leak. Public
enrollment is not signed off as enumeration-resistant. A reviewed durable delivery
mechanism with uniform request behavior is follow-up work; arbitrary sleeps, dummy
emails and an unsafe in-process fire-and-forget queue are not a demonstrated fix.
This review does not claim a clean security release or close that finding.

## Email readiness and required external setup

The existing Resend HTTPS adapter uses the fixed official send API over verified TLS,
with no redirects or automatic retries. No new SDK, paid mail/SMS service or hosting
plan is introduced. Mocked provider acceptance is not proof of delivery.

Manual Resend procedure (not executed):

1. Use/create your own account on the [Resend Free plan](https://resend.com/pricing).
   Do not enable a paid plan, trial or add-ons. Current advertised transactional
   limits are 3000 emails/month and 100/day; confirm actual account allowances.
2. For public recipients, add an **existing domain/subdomain you own** and add the
   exact SPF/DKIM records Resend provides. Wait for Verified status. Do not invent a
   sender, buy a domain, or replace existing mail/MX records unnecessarily. Follow
   [verified-domain guidance](https://resend.com/docs/dashboard/domains/introduction).
3. Without an owned verified domain, the provider's test sender can only address
   the account owner's recipient; it is not public enrollment. See the
   [resend.dev restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).
   If neither option is available, keep verification/recovery blocked; never bypass it.
4. Create a sending-access API key, scoped to the verified domain where available.
   Copy it privately into the server secret store; do not send it to this chat, Git,
   EAS public variables or logs. Disable link/open tracking for credential emails.
5. After approval, set `AUTH_EMAIL_PROVIDER=resend`, `RESEND_API_KEY` and
   `RESEND_FROM` to the actual permitted sender. Config validation cannot establish
   domain ownership, quota or inbox delivery. Provider permission/DNS must be verified.
6. After the approved migration/backend/APK sequence, test actual registration,
   receipt, cold/warm verification link, one-time consumption, resend/new-link behavior,
   forgotten password, reset receipt, reset replay rejection and login with the new
   password. Confirm old sessions are revoked. Do not paste action links or tokens.

[Render Free blocks standard SMTP ports 25/465/587](https://render.com/docs/free).
The HTTPS adapter avoids that hosting restriction; the TLS SMTP adapter remains an
option only in environments that permit it. No real provider key or sender was
invented and **no real email delivery is verified**.

## Mobile navigation and fitness readiness

Expected flow remains launch→bounded secure restoration→Welcome when signed out;
pending accounts→verification; verified incomplete setup→existing onboarding;
verified returning accounts→Dashboard; logout/revoked sessions→Welcome/Login.
Access tokens remain in memory; refresh credentials use SecureStore with a persisted
rotation marker and account-generation guards. Public action links do not consume
tokens automatically. No phone/local account data was cleared during this work.

All six tabs read existing typed APIs. Nutrition/catalog browsing is not meal entry;
workout Start creates an unplanned in-progress session, not completed sets/workouts.
Detailed logging/editors and device synchronization remain outside this skeleton scope.
Unknown measurements and zero logs are distinguished and no fitness data is fabricated.
Physical cold/warm links, native widget rendering, Android lifecycle and real auth
acceptance still require the updated A35 APK; mocked component tests cannot prove them.
Background-expiry coverage uses a virtual clock and the next API request. There is
no new foreground listener that immediately refreshes account status without a request.

## Clerk source and deployed-service status

Active runtime/dependency scans find no provider SDK, hosted flow, provider cache,
JWKS validator or publishable-key requirement. Historical identifiers/docs and old
live credentials are retained for data compatibility and rollback. The prepared
source is separate from the old installed APK and running Render service.

Read-only public smoke on the existing Render deployment returned health 200,
database health 200, missing bearer 401 and deliberately invalid bearer 401. The first
liveness request took 42.63 seconds; this is consistent with a possible cold start,
not proof of its cause. Public deployed OpenAPI has 47 paths and **zero** first-party
auth paths; it is still the older contract. No real token/password was used.
These checks do not verify the replacement backend or email flow.

## Dependency and release security

Fresh pip-audit: 77 locked runtime packages, no known vulnerabilities. Contracts npm
audit: zero findings. Mobile npm audit: 5 high affected-package entries,0 critical;
registry signatures verified for 1307 packages and attestations for 315.

| Advisory | Installed/reachable context | Compatible remediation and release impact |
| --- | --- | --- |
| [node-forge signature verification](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | node-forge1.4.0 through Expo CLI/certificate tooling; development/build certificate handling | Latest published1.4.0 remains affected and advisory has no patched version. Do not process untrusted certificates; upstream fix or explicit reviewed risk acceptance required before release. |
| [Zod collection memory exhaustion](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) | Zod3.25.76 in Expo CLI/lint config validation | Patched4.6.6+ (latest4.6.7) is outside the current3.x dependency contract. No supported compatible patch found. Avoid untrusted/oversized configs; await upstream migration or reviewed acceptance. |

The other affected entries are the dependency chain `@expo/cli`,
`@expo/code-signing-certificates` and `expo`, not five unrelated exploitable auth
bugs. Runtime auth does not import node-forge/Zod. They remain reachable tooling
risks, not dismissed as unused. Current Expo 58 registry versions do not provide a
compatible remediation. No forced audit fix, Expo downgrade, major Zod override or
lockfile rewrite was performed. Recheck before any cloud build and by 2 November 2026.

## Verification evidence

The earlier single full-run process was interrupted before producing its final XML
or cleanup confirmation. It is not counted as passing, and broad deletion of old
test databases was not attempted without exact ownership evidence. The complete
suite was rerun in recorded batches: all non-integration tests and every test
in the four integration files, each file in a fresh disposable database. Earlier
targeted successes are not substituted for that complete inventory.
The completed inventory contains **281 distinct passing backend cases: 236 unit
and 45 PostgreSQL integration cases**, with zero failures/errors/skips in the final
selected reports. This adds 38 cases to the 243-case baseline. No application or
migration logic changed after the integration batches. The later logging-only runner
hardening was verified with the full unit suite and a representative real PostgreSQL
registration/verification/login test; its additional pass is not double-counted.
All Python commands use `python -m uv run --no-sync`; Windows Application Control
and the SQLAlchemy 2.1.6 pure-Python installation remain intact.

| Check | Actual result |
| --- | --- |
| No-sync SQLAlchemy import/status check | PASS, version 2.1.6, `HAS_CYEXTENSION=False` |
| `python -m uv run --no-sync pytest -q -m 'not integration' --junitxml=.pytest_cache/phase2-final-unit.xml` | Final: 236 passed, 45 integration tests deselected, 12.48 seconds |
| PostgreSQL `tests/integration/test_first_party_auth.py` through `scripts.run_postgres_tests` | 11 passed, 222.10 seconds; generated database removed, runner exit 0 |
| PostgreSQL `tests/integration/test_postgres.py` through `scripts.run_postgres_tests` | 18 passed, 342.71 seconds; generated database removed, runner exit 0 |
| PostgreSQL `tests/integration/test_day2.py` through `scripts.run_postgres_tests` | 12 passed, 247.03 seconds; generated database removed, runner exit 0 |
| PostgreSQL `tests/integration/test_day3.py` through `scripts.run_postgres_tests` | Final rerun: 4 passed, 71.35 seconds; generated database removed, runner exit 0 |
| Hardened-runner PostgreSQL registration/verification/login smoke | Final retry: 1 passed, 21.16 seconds; sanitized XML and generated-database removal verified |
| Targeted email/readiness/security regressions | 52 passed in 0.81 seconds |
| Proxy regression red/green | Before fix: 2 failed, 18 passed; after fix: 20 passed |
| `python -m uv run --no-sync ruff check .` | PASS |
| `python -m uv run --no-sync ruff format --check .` | PASS, 104 files |
| `python -m uv run --no-sync python -m scripts.export_openapi --check` | PASS, artifact matches application |
| Mobile `npm run typecheck`, `npm run lint` | PASS |
| Mobile `npm test -- --silent --json --outputFile=.expo/phase2-final-tests.json` | 129/129 passed, 10 suites, 16.208 seconds |
| `npm exec --yes expo-doctor` | 20/20 checks passed |
| `npm exec expo -- prebuild --platform android --no-install` | PASS, local generated Android project only |
| `npm exec expo -- export --platform android --output-dir dist --clear` | PASS, Hermes Android bundle, 1379 modules |
| `npm run verify:release` | PASS, public configuration only |
| Contracts `npm run check`, `npm run typecheck` | PASS |
| Python runtime advisory audit | PASS, 77 locked packages, no known vulnerabilities |
| Mobile `npm audit --json` | NOT CLEAN, exit 1: 5 high affected-package entries, 0 critical |
| Mobile `npm audit signatures` | PASS, 1307 signatures and 315 attestations |
| Contracts `npm audit --json` | PASS, zero findings |
| `node scripts/check-sprint-config.mjs` | PASS |
| `node scripts/scan-sprint-secrets.mjs` after Hermes export | PASS, 257 candidate/bundle files; 29 bundle files, 0 credential matches |
| Active source/dependency Clerk scan | No matches; historical compatibility identifiers retained |
| Generated manifest / Hermes old-key check | PROVIA scheme present; no Clerk manifest reference; old public key absent from bundle |
| Existing application database, read-only SELECT/schema inspection | Revision 0004; no auth tables |
| Read-only auth preflight on current application configuration | Expected BLOCKED: email configuration missing/invalid and schema not at 0005; no live acceptance inferred |
| `git diff --check` | PASS |

The first Day 3 batch had 3 passes and 1 setup error from transient DNS resolution
(`getaddrinfo failed`, Windows error 11001); the entire four-case file passed on
rerun. The later runner smoke also encountered a DNS setup error, then passed on
its explicit retry. Failed artifacts are retained in sanitized ignored XML files;
they are not represented as passes. No automatic retry, SSL weakening, DNS override
or test-assertion change was introduced. Intermittent network/DNS reliability remains
an operational risk. Every completed verification runner confirmed removal of its
own generated database. Final read-only catalog inventory found **two older
generated-name databases**; exact ownership/cleanup from the interrupted runs is
unconfirmed. No broad deletion was attempted; operator review is required.

Each integration command used the form below with all four files listed in the
table and its corresponding `phase2-final-*.xml` path. Full reports and the deduplicated
summary are ignored under `services/api/.pytest_cache`; mobile results are under
`apps/mobile/.expo`. They are not committed.

```powershell
python -m uv run --no-sync python -m scripts.run_postgres_tests tests/integration/test_day3.py --junitxml=.pytest_cache/phase2-final-day3.xml
```

The ignored `.env.local` still has an obsolete public Clerk setting; it is unused by
source and absent from the exported bundle. No credential/environment file was
modified merely to remove historical configuration. The release check warns that
`NODE_ENV` was unspecified, then succeeds; actual Android export ran through Expo.
The combined verification has not bypassed or changed Windows Application Control.

Audit commands used the installed mobile lockfile (`npm audit --json`, `npm audit
signatures`) and the contracts lockfile (`npm audit --json`). Python runtime pins
were exported with `python -m uv export --locked --no-dev --no-hashes
--no-emit-project --format requirements-txt`; all 77 runtime entries were supplied
to `pip-audit --disable-pip --no-deps` through the isolated uv tool runner. No
project synchronization, forced upgrade, alternative project interpreter or lockfile
change was used. Audits identify known advisories, not every possible vulnerability.

## Executable operator runbook and approval gates

The following steps are **instructions, not actions performed**. Each mutation gate
needs separate explicit approval. Do not deploy a mismatched old-APK/new-backend pair.

### A — Neon backup, migration and checks

Use the full [Neon operator procedure](phase2-neon-readiness.md) for private libpq
service/password files, approved-client backup, archive hash and an isolated restore
test. `pg_dump`, `pg_restore` and `psql` were not on PATH; no alternate executables
were installed or security controls changed. Obtain authorized client installation
if needed. Backup files contain sensitive data and belong outside Git/cloud-sync on
an encrypted restricted volume. Merely listing an archive is not a restore test.

Only after the intended database, maintenance window, backup/restore and approval
are established:

```powershell
Set-Location 'D:\Dhyan\Self Projects\Provia\services\api'
python -m uv run --no-sync alembic current
if ($LASTEXITCODE -ne 0) { throw 'Revision check failed.' }
# Require the intended direct database at 0004 and explicit migration approval:
python -m uv run --no-sync alembic upgrade 0005
if ($LASTEXITCODE -ne 0) { throw 'Migration failed. Stop cutover.' }
python -m uv run --no-sync alembic current
if ($LASTEXITCODE -ne 0) { throw 'Post-migration revision check failed.' }
python -m uv run --no-sync alembic check
if ($LASTEXITCODE -ne 0) { throw 'Schema drift. Stop cutover.' }
python -m uv run --no-sync python -m scripts.verify_auth_readiness
if ($LASTEXITCODE -ne 0) { throw 'Local auth readiness check failed. Review its scope before cutover.' }
```

The final preflight also requires mail/signer config and may remain blocked until
those are present. Verify 0005, all five auth tables, validated FKs, and private
pre/post counts plus sampled stable UUID/snapshot relationships during a write-free
comparison window. New auth tables are empty before controlled enrollment;0005
does not claim or duplicate legacy users. Keep the direct URL only in the operator
environment; runtime retains pooled Neon TLS connectivity.

### B — Render environment and manual deployment

| Variable | Operator value/source | Secret? |
| --- | --- | --- |
| `DATABASE_URL` | Existing approved pooled Neon connection, TLS retained | Yes |
| `AUTH_JWT_SECRET` | Privately generated random signing value, at least 32 random bytes; recommend 48 | Yes |
| `AUTH_TOKEN_ISSUER` | `https://provia-mag7.onrender.com` | No |
| `AUTH_TOKEN_AUDIENCE` | `provia-mobile` | No |
| `AUTH_ACCESS_SECONDS` | `900` | No |
| `AUTH_REFRESH_DAYS` | `30` | No |
| `AUTH_TRUSTED_PROXY_CIDRS` | `[]` until exact immediate trusted proxies are verified | No |
| `AUTH_EMAIL_PROVIDER` | `resend` | No |
| `RESEND_API_KEY` | Actual sending-only provider key | Yes |
| `RESEND_FROM` | Actual permitted sender, not an invented domain | Private configuration |
| `APP_ENV/DEBUG/LOG_LEVEL` | `staging` / `false` / `INFO` | No |
| `PYTHON_VERSION` | `3.12.15` | No |
| `CORS_ORIGINS` | Existing approved exact origins; `[]` for native-only blueprint | No |
| `USDA_API_KEY/OFF_USER_AGENT` | Preserve existing approved nutrition settings | Key is secret |

Do not put `DIRECT_DATABASE_URL` into runtime or any secret into `EXPO_PUBLIC_*`.
Do not weaken JWT issuer/audience verification or trust every proxy network. Render
outbound IP ranges are not evidence of immediate ingress proxies. Until ingress is
verified, peer-based client buckets can be shared by users behind the same proxy;
identity buckets still apply.

Generate a new deployment signer privately in your approved secret manager or local
cryptographic generator. Do not print/paste it into chat or overwrite old live keys
before cutover approval. Changing the signer invalidates existing access JWTs and
changes HMAC bucket keys; refresh families also need explicit revocation on compromise.

After deployment approval and verified migration, select the reviewed commit through
the existing repository's authorized workflow; this task does not push or merge it.
The blueprint tracks `main`, while this verified commit is local on
`codex/first-party-auth`. Publishing the branch and any reviewed merge, or changing
the service's tracked branch, require separate explicit approval before Render can
obtain that code. Do not deploy the old remote commit or silently change branches.
Confirm in the actual service dashboard that auto-deploy is off before publishing
to its tracked branch; the local blueprint alone does not prove the live setting.
If it is enabled, stop and obtain approval for the deployment-policy change first.
Preserve service identity, Free plan and auto-deploy off. Build command:
`bash scripts/render_build.sh`. Start command:

```text
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port $PORT --no-access-log --no-proxy-headers
```

`$PORT` above is expanded by Render's Linux shell, not a Windows variable to replace
in the dashboard. The Linux build installs locked dependencies and never migrates;
do not run its ordinary sync as a Windows environment repair.

After deploy, health/db 200 proves connectivity only. Confirm deployed OpenAPI includes
`/api/v1/auth/login`. The local operator preflight must target the same approved
database at 0005; it does not inspect Render variables. Controlled remote login,
refresh and verification checks establish deployed behavior. Run safe smoke:

```powershell
Set-Location 'D:\Dhyan\Self Projects\Provia'
node scripts/check-sprint-backend.mjs https://provia-mag7.onrender.com/api/v1
```

Expected: health/database 200; missing/invalid bearer 401. Real login/refresh 200;
registration/resend/recovery generic 202; pending/disabled fitness 403; foreign-owned
record 404; malformed/expired action 400; invalid schema 422; throttle 429. Missing
signer/schema/provider can be genuine 503. A 202 never proves mail delivery.
Trace safe status/category/request ID, never raw bodies/tokens. An old schema/404
auth route means wrong release; DB 503 needs connection/schema/permission review;
repeated 401 needs issuer/audience/key/session checks without disabling validation.

Eventually obsolete `AUTH_ISSUER`, `AUTH_JWKS_URL`, `AUTH_AUDIENCE`,
`AUTH_AUTHORIZED_PARTIES`, `AUTH_REQUIRE_AUTHORIZED_PARTY` and mobile
`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` can be removed **only after** acceptance and an
agreed rollback window. The replacement ignores them; none was removed live here.

### C — Email acceptance

Complete the Resend setup above using the real owner-controlled account and sender.
After approval, verify real inbox receipt and native links on the updated app. Test
expired/replayed links, resend invalidation and reset/session revocation. Keep sender
ownership, provider acceptance and actual delivery as separate evidence. If a mail
client does not open custom-scheme links, stop that acceptance case and document the
client; do not mark the email flow verified from a mocked response or bypass.

### D — Expo/EAS and Samsung A35

Configure only `EXPO_PUBLIC_API_URL=https://provia-mag7.onrender.com/api/v1` in the
approved EAS preview environment after environment-change approval. Retain existing
owner/project/package/signing credentials; do not run a new project initialization or
generate replacement signing credentials. Preview remains internal distribution,
`developmentClient:false`, `android.buildType:apk`.

After backend API and provider/inbox acceptance, explicit cloud-build approval and
dependency-risk review, the exact manual command is below. Complete native link and
end-to-end acceptance after installing that APK; those device checks are not a
prerequisite for creating the APK needed to perform them.

```powershell
Set-Location 'D:\Dhyan\Self Projects\Provia\apps\mobile'
npm run verify:release
if ($LASTEXITCODE -ne 0) { throw 'Release configuration failed.' }
npx eas-cli@latest build --platform android --profile preview
```

No build was submitted. Download the resulting APK privately. Install as an update
with the same package/signing identity; never uninstall/clear data to force success.
With already approved Android tools, the operator may use `adb install -r` on the
actual new APK. A signature mismatch requires investigation, not a phone reset.

A35 acceptance checklist:

- Existing installation update and signed-out launch; no infinite spinner.
- New/duplicate/invalid registration; actual email receipt; cold and warm links;
  expired/replayed links; resend and reset; malformed links and safe unknown routes.
- Valid/invalid/disabled login, pending verification gate, new-user onboarding and
  returning-user Dashboard; all six tabs with empty and populated data.
- App process restart and background/resume; offline launch, slow backend, timeout,
  expired access/refresh, revoked family and network recovery.
- Logout, logout-all, account switch and stale-response cancellation without cached
  cross-user data or duplicate refresh/workout mutations.
- Real protected API operations and cross-user denial using controlled accounts;
  no passwords, JWTs, action URLs or personal fitness records in shared logs.

### E — Rollback and legacy users

Stop new auth writes and coordinate a compatible backend/APK pair. Keep 0005 tables
and old live provider credentials; do **not** downgrade a populated application DB.
The downgrade destroys first-party credential/session history even though fitness
rows survive. Old backend code ignores additive auth tables, but new first-party
accounts do not become Clerk accounts automatically. Keep UUID links/backups and
prefer a forward repair. Restore over live data only as separately approved recovery
that accounts for newer fitness writes. No automatic email-based merger is acceptable.

## Remaining blockers and explicit approval requests

Finish all local verification before requesting any mutation. External actions need
the following separate approvals, in order:

1. Approved private backup/restore tooling and verified backup; then apply 0005 only
   to the named existing development database in the agreed maintenance window.
   Separately review ownership of the two older generated-name test databases
   before authorizing any cleanup; do not delete databases merely by a name prefix.
2. Separately approve publication of the reviewed local branch and the intended
   review/merge workflow so the existing Render service can obtain that exact code.
   Confirm live auto-deploy is off first. No push, merge or service-branch change
   has been performed.
3. Configure the actual free permitted sender/API key and approved Render secrets,
   then manually deploy the reviewed commit. Broad legacy-user cutover additionally
   requires the approved enrollment workflow; do not treat a new empty account as migration.
   Public enrollment also requires resolution or explicit reviewed acceptance of
   the open timing-enumeration finding; passing regression tests does not close it.
4. After server API/provider acceptance and tooling-risk review, submit one preview EAS
   build, then perform the A35 update/test checklist without clearing data.

No approval to any of these has been inferred from local test success. Sender
ownership/delivery, legacy enrollment, private backup restoration and actual
deployment/APK/device acceptance remain unverified.

## Final status

PASS below describes completed local checks or the documented foundation scope.
It does not close the open timing finding, dependency advisories, email setup,
legacy enrollment, old-test-database review or deployment/device acceptance.

| Area | Status |
|---|---|
| First-party backend | PARTIAL |
| Neon migration | READY |
| Email verification | CONFIGURATION REQUIRED |
| Mobile authentication | PARTIAL |
| Expo navigation | PASS |
| Fitness screens | PASS |
| Clerk removal | COMPLETE IN SOURCE |
| Security tests | PASS |
| Render deployment | NOT STARTED |
| EAS APK | NOT BUILT |
| Physical-device test | NOT VERIFIED |
