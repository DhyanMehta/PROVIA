# Sprint48 remaining work

Start from the verified execution1 commit; inspect the tree and report before editing.
Keep the ₹0 budget and existing Python/SQLAlchemy repair. Do not treat partial checks
or generated Android code as a working installed APK.

## P0 — unblock the actual vertical slice

1. Administrator approval for the existing blocked Python executable; then rerun
   SQLAlchemy import,233 backend/PostgreSQL tests, Ruff and Alembic0004 checks.
2. User account setup/private Git remote and explicit Neon-target approval before
   Render deployment. Confirm no billing/card/paid overage exposure. Deploy Free,
   then verify HTTPS, health, DB readiness,401 and real cold-start behavior.
3. Set the real public mobile API URL and Clerk development publishable key. User
   enables/configures Native API/package callback. No secret values in Expo public env.
4. Use a verified free EAS Android quota or approved local JDK17/Android SDK37/adb
   installation. Build early development APK; then standalone preview with public HTTPS.
5. Install on Samsung A35, run the first-flow checklist, prove actual Clerk session,
   profile/goal persistence, sign-out and restart. No simulator/mock substitution.

## P1 — app features and correctness

- Nutrition: actual food search/details, custom food/recipe entry, portions/grams,
  meals CRUD and historical day summaries. Respect null nutrients and snapshots;
  server formulas remain authoritative. Display provider failures/attribution.
- Workouts: exercise catalog/custom exercises, weekly plans/rest days, planned and
  unplanned sessions, sets/reps/load, working/warmup/skipped states and terminal
  transitions. Add detail-path API client parameters before wiring dynamic endpoints.
- Tracking: water logs/dated targets, measurement-only weight logs and explicit
  goal-preview/apply confirmation. Profile-weight edits must not silently trigger goals.
- Activity/sleep screens: manual entries and real canonical sync/overlap/conflict UX.
- Progress: actual daily/range analytics, weight history, workout records and query
  limits; no inferred missing values or fabricated charts.
- Goal POST idempotency: current client stores an encrypted account-scoped pending
  intent and fails closed on unresolved outcomes. Add a tested backward-compatible
  server idempotency mechanism before claiming global duplicate prevention across
  devices/reinstalls. Do not alter the backend while its verification is blocked.
- Health Connect: evaluate react-native-health-connect4.1.3 with SDK58/RN0.88 compiled
  custom builds, minSdk26, manifest permissions/rationale/settings activities. Read
  only approved step/sleep data on-device, aggregate complete days, persist ID mappings,
  reconcile deletions and expired changes tokens, respect permission loss. Real device
  matrix and Android/Play policy work are required before release.
- Indian nutrition: obtain verified legally reusable data and provenance approval;
  use existing importer. Do not fabricate coverage. OFF live availability remains
  an external provider issue; preserve local/USDA fallback.

## P1 — security and build follow-ups

Six npm high findings remain through upstream dependencies: node-forge1.4.0 has no
patched release for GHSA-86w9-cpqp-85rv; transitive Zod3 needs a compatible upstream
upgrade for GHSA-mrhx-c7xc-m3w5 (fixed4.6.6). Do not force Expo44 downgrade or override
Zod3 with4. Keep Metro loopback and code-signing inputs trusted. No direct exploitable
app path was established by review, but audit is not clean and release needs follow-up.
Review again by2026-10-26 and before any public release. See advisory links in the
execution report. Backend dependencies were not changed.

## P2 — finish and release

- Replace stock scaffold launcher/splash artwork with approved PROVIA branding.
- Refine device accessibility, dark mode and keyboard layouts after the P0 flow works.
- Use stable signing, a verified HTTPS URL, actual public config and a standalone
  preview APK. Record size/hash/package, install it and test without Metro.
- Run full backend/mobile/contract checks, two-account isolation, offline/timeout and
  cold-start regressions; inspect archive and APK for credentials/local URLs.
- Complete deployment rate-limit/monitoring/backup/privacy follow-ups before claiming
  production readiness. Do not introduce paid infrastructure during this sprint.
