# PROVIA Sprint48 execution1 report

Date:2026-10-25 (Asia/Calcutta). Starting commit8d65207 on main, initially clean.
Ending commit is the commit containing this report; the final handoff records its hash.
Scope: prepared deployment plus an independently verified Android frontend foundation.
Actual hosting, real-session flow and installed APK remain incomplete for the reasons below.

## User decisions and budget

User explicitly selected **prepare deployment only**, **prepare account setup
instructions**, and can connect the Samsung Galaxy A35. Consequently no Render/Expo
account was created/logged in, no DB credential granted to hosting, no cloud build
submitted, no resource/billing/trial activated, and no paid build credit used. ₹0 maintained.
No public HTTPS URL is available or assumed.

## Checkpoint A — deployment

Render Free configuration is prepared in render.yaml, rooted at services/api, pinned
to Python3.12.15 and plan:free, manual deploy only. Linux build uses the existing uv
lockfile with uv0.13.5; startup binds0.0.0.0/$PORT and probes `/api/v1/health/db`.
No migration or new database is created. DIRECT_DATABASE_URL is not sent to the runtime.
Static config checks verify actual setting names, string values, no embedded secrets,
free plan, port/health settings, APK profiles and native/archive exclusions.

[Render free limits](https://render.com/docs/free):750 workspace hours/month,
15-minute idle spin-down and roughly one-minute cold wakeup; pipeline/bandwidth limits
depend on account. Saved payment methods can expose overage billing, so inspect the
actual account and stop if a card/payment/paid resource is required. No eligibility
or usage allowance was assumed from the public pricing page.

Hosted build, HTTPS health, DB readiness and cold-start checks: **NOT RUN**.
Next action: user account/private Git remote setup, explicit target approval, manual
free deploy and documented smoke checks. There was no remote configured in this repo.

## Checkpoint B — mobile foundation

Created apps/mobile from the official Expo template, replacing the original.gitkeep.
Node22.22.2/npm10.9.7; Expo58.0.19, React Native0.88.0, React19.3.0, Expo Router58.0.26,
@clerk/expo4.14.1, expo-secure-store58.0.2, @expo/ui58.0.23, TypeScript6.0.3.
Exact installed versions are pinned by the independent package-lock; install scripts
are disabled via .npmrc. Existing shared contracts/package manager boundary is preserved.

- PROVIA name/package com.provia.app, scheme provia, safe-area/keyboard layouts,
  theme tokens, light/dark colors, native buttons, accessible fields and metric cards.
- Protected Router navigation for authentication, onboarding, dashboard and profile.
  Nutrition/workouts/tracking/progress routes explicitly state they are not implemented yet.
- Generated OpenAPI request/response/query types imported from packages/api-contracts;
  backend schemas/formulas were not duplicated or edited.
- API client gets SDK bearer tokens, preserves request IDs, handles errors safely,
  bounds cancellation/timeouts including token acquisition, refreshes401 GET once,
  and avoids automatic mutation retries. Account changes cancel/deactivate old clients.
- Public-only configuration; standalone URL guard rejects missing/non-HTTPS/local
  endpoints and secret keys. No actual public API URL or Clerk key is prefilled.

## Checkpoint C — Clerk

Hosted sign-up/sign-in implemented using the supported SDK, tokenCache/SecureStore,
loading/errors/sign-out and protected routes. Config plugin generated
`clerk://com.provia.app.hosted-callback` in AndroidManifest. No custom auth backend,
password/OTP handling, AsyncStorage token persistence or token logging was added.

Actual Clerk session/backend identity/owned resource/refresh/sign-out: **BLOCKED**.
User must configure the existing development app's Native API and public key, obtain
an authorized real session, and execute the checklist. Stateless server JWTs are not
claimed immediately revoked by local sign-out.

## Checkpoint D — first vertical slice

Implemented welcome → hosted auth → profile/name/height/activity → current/target
weight → server maintenance preview → deficit → server macro preview → explicit
confirmation → unified dashboard. Returning users load current server profile/active
goal, paging beyond the first goal-history page. Existing profile values are not
silently rewritten by a goal update, preserving backend historical goal behavior.

Dashboard uses real endpoint fields for calories/macros/water/activity/workouts/sleep,
with unknown/no-log states, refresh and stale-content errors. No fake production data
or local nutrition calculator exists. Component tests use synthetic server fixtures.

Saves disable repeated submission, retain drafts and only navigate after success.
Before POST, SecureStore records a minimal canonical pending goal intent under the
verified backend account UUID. Unknown network/abort/server outcomes retain it across
restart/sign-out. Only a positive matching server read resolves it; an absent read
cannot prove rollback and cannot trigger a second POST. Unresolved intents fail closed
and require operator reconciliation. True cross-device/server idempotency remains
execution2 work. This is documented rather than claiming universal deduplication.

Real signup/login: BLOCKED. Real Neon profile/goal persistence: BLOCKED. Server-based
previews/confirmation/dashboard: implemented and fixture-tested, **not live verified**.
Actual app restart/session persistence: NOT RUN. Full first end-to-end flow: BLOCKED.

## Checkpoint E — APK/native build

- Expo Android prebuild: PASS, native project generated with package/callback/minSdk26.
- Expo Doctor:20/20 checks passed.
- Metro Android/Hermes bundle export: PASS, approximately4.6MB. This is not an APK.
- Development profile: internal development-client APK requiring Metro.
- Preview profile: internal standalone APK; release-config guard requires real HTTPS/public config.
- Local APK attempt: `expo run:android --no-install --no-bundler` failed because
  Android SDK/platform-tools/adb were absent. Only Java8 was detected; JDK17 plus
  SDK58-compatible Android tooling is required. No APK path/size can be reported.
- EAS account plan/quota/queue: unverified. Public Free plan advertises15 Android
  builds/month; no submission or quota consumption occurred.
- APK install/launch/Clerk callback/backend reachability on Samsung: NOT RUN.
- Future Health Connect path: maintained react-native-health-connect v4 custom-build
  approach, API26+, no Expo Go support. Actual SDK58/RN0.88 native compilation and
  device compatibility remain pending; no health permissions were requested now.

## Verification and review

| Area | Result |
| --- | --- |
| Mobile tests |36 passed,5 suites; API/auth/cancellation, lost-response/delayed-commit, form/dashboard and StrictMode coverage |
| Mobile TypeScript/lint |PASS; no errors/warnings at final check |
| Expo public config/Doctor |PASS;20/20 checks |
| Android prebuild/JS export |PASS; native configuration/bundle only |
| Render/EAS static checks |PASS; not actual cloud build validation |
| Backend Ruff |PASS;90 files formatted |
| Current backend tests/PostgreSQL |BLOCKED before Python launch; no current pass claim |
| Current import/startup/migration |BLOCKED; expected0004/21 tables are last Day3 evidence |
| Shared generated contracts |No backend schema changes; mobile compile reuses existing declarations |
| Independent review |Required retry-race, archive and StrictMode findings fixed; no required findings remain |
| Mutation verification |Replacing layout effect with passive effect made the StrictMode test fail with SESSION_CHANGED; source restored byte-for-byte |
| Secret/bundle scan |PASS;207 candidate/bundle files,29 exported bundle files, zero configured credential matches |

Blocked backend executable:
`D:\Dhyan\Self Projects\Provia\services\api\.venv\Scripts\python.exe`.
Policy error: `An Application Control policy has blocked this file. (os error4551)`.
No Windows protection, interpreter requirement or SQLAlchemy installation was changed.
All backend business code, models, migrations, lockfile and existing233 tests are
unchanged; only a separate Render Linux build script was added. No DB writes occurred.

Dependency audit is **not clean**: six high findings trace through upstream Expo/Clerk
dependencies to [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv) and
[Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). Forge1.4.0 has no patched
release; Zod3 consumers need a compatible upstream upgrade rather than an unsafe
major override. No direct exploitable app path was established by review; Metro is
loopback and signing inputs must be trusted. Do not certify production security.
Review by2026-10-26 and before public release; no forced downgrade/upgrade was applied.

## Files and handoff

Created mobile source/routes/components/providers/tests/configuration and npm lock,
Render YAML/Linux script, root config/smoke helpers and both EAS ignore files. Existing
backend app/contracts preserved. See Git diff/stat for exact generated file inventory.
Stock scaffold launcher artwork remains a P2 branding item; no decorative time was
spent ahead of deployment/auth/build blockers.

- [Preflight](sprint48-preflight.md)
- [Exact account/deployment/APK instructions](sprint48-deployment.md)
- [Real-device/first-flow checklist](sprint48-device-checklist.md)
- [Prioritized remaining work and execution2 dependencies](sprint48-remaining-work.md)

Next execution can continue frontend feature work locally, but the usable installed
end-to-end APK still depends on authorized Python approval, user account/configuration,
free hosting/build verification and real device tests. Commit independently verified
local work only; do not mark these external/environment blockers resolved.

PROVIA SPRINT EXECUTION 1 — PARTIAL

BACKEND DEPLOYED — NO

REAL CLERK SESSION VERIFIED — NO

FIRST END-TO-END FLOW — BLOCKED

EARLY APK BUILT — NO

APK INSTALLED ON DEVICE — NO

FREE BUDGET MAINTAINED — YES

READY FOR EXECUTION 2 — YES
