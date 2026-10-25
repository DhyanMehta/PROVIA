# Sprint48 deployment and account handoff

User chose preparation only. No public backend URL, account login, database permission
or cloud build has been verified. Keep the ₹0 budget: never add a payment method,
enable billing, select paid compute, buy credits or start an auto-converting trial.

## Render backend

1. Resolve Windows Application Control through authorized administrator approval
   (see preflight). Confirm the existing local import/startup,233 backend regressions,
   Ruff and Alembic current/check with `uv run --no-sync`. No ordinary Windows sync.
2. Create/use a Render account yourself. Check the actual workspace has no chargeable
   resources or saved-card overage exposure. Verify remaining free build/bandwidth
   allowance and free-instance hours; stop if a payment method is mandatory.
3. This repo currently has no remote. Choose a private GitHub/GitLab repository and
   push verified commits yourself; do not publish backend credentials. Grant Render
   only the repository access needed. These are explicit user/account actions.
4. Review root render.yaml: web runtime python,plan free,branch main,rootDir services/api,
   Python3.12.15, build `bash scripts/render_build.sh`, start binds0.0.0.0/$PORT,
   healthCheckPath `/api/v1/health/db`, auto-deploy off. No Render database is created.
   Linux build installs uv0.13.5 and existing locked dependencies. It performs no migration.
5. Obtain explicit approval for the intended Neon development DB before giving Render
   its pooled URL. Use only the approved development Clerk instance/test accounts.
   Do not deploy against a production resource during this sprint.
6. Enter environment values privately in Render; never paste them into chat, Git,
   screenshots or logs. The following is names/purposes only:

| Setting | Purpose |
| --- | --- |
| DATABASE_URL | Approved pooled Neon development connection with TLS |
| APP_ENV=staging | Hosted private sprint environment; separates local development |
| PYTHON_VERSION=3.12.15 | Preserve backend Python requirement |
| DEBUG=false, LOG_LEVEL=INFO | Safe logs; no client-visible traceback |
| AUTH_ISSUER | Existing Clerk development issuer |
| AUTH_JWKS_URL | Explicit HTTPS JWKS if not derived from development issuer |
| AUTH_AUDIENCE | Only if actually required by the existing auth contract |
| AUTH_AUTHORIZED_PARTIES | JSON allowlist matching actual present azp claims |
| AUTH_REQUIRE_AUTHORIZED_PARTY | Keep existing contract; do not force fake native origins |
| CORS_ORIGINS | Explicit origins for any web preview; native requests need no CORS origin |
| CORS_ALLOW_CREDENTIALS | Existing false unless separately justified |
| USDA_API_KEY | Optional food adapter, server-side only |
| OFF_USER_AGENT | Actual operator contact required for public provider use |
| NUTRITION_MIN_DAILY_CALORIES | Existing safeguard; preserve configured value |

DIRECT_DATABASE_URL is not needed by the running service. Retain it in the authorized
operator environment only for read-only Alembic checks/approved migrations. No schema
change is needed: current expected head0004. No credentials are in the Blueprint.

7. Choose Free and manually deploy only after reviewing final settings. Check actual
   deployment health/database/protected401 over the assigned HTTPS URL; a successful
   build alone is insufficient. Repeat after >15minutes idle to verify cold start.
   Do not use artificial keepalive traffic to evade free-tier sleep limits.
8. Run root `node scripts/check-sprint-backend.mjs https://YOUR-VERIFIED-HOST/api/v1`.
   It reports only statuses and no token. Real authenticated checks require the app.

Current checkpoint A: configuration prepared; hosted build/HTTPS/DB readiness/cold start
NOT RUN; URL unset. Next action: user account setup, DB-target approval and manual deploy.

## Expo and Clerk

From apps/mobile, `npm ci --ignore-scripts`. Set only these public values in ignored
`.env.local`: EXPO_PUBLIC_API_URL and EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Use the real
development publishable key from Clerk's dashboard; never a secret key. No API URL is
invented or prefilled. Native local testing can use an explicitly reachable local URL;
standard Android emulator host bridge is10.0.2.2. Physical devices need a reachable
authorized host or adb reverse; localhost on the device is the device itself.

Enable Native API in the existing Clerk development application yourself. This is a
security-sensitive account setting and needs your review. Android package is
`com.provia.app`, app scheme `provia`. Generated hosted callback is
`clerk://com.provia.app.hosted-callback`, installed by the Clerk config plugin.
Register Android namespace/package as required by the current Clerk dashboard. Rebuild
native code after package/plugin changes. No custom password/OTP flow is implemented.

Use `npm start` (localhost Metro), or an explicitly authorized LAN development server
if a real phone needs it. `expo-secure-store` backs Clerk's token cache. Do not copy
session tokens into shell arguments/history/files/chat. SDK attaches fresh bearer
tokens;401 GET refreshes once; writes are not automatically retried. Sign-out clears
local authenticated navigation, not the server's already-issued JWT before expiry.

## Early APK

Prepared profiles:

- development: internal APK with Expo development client; requires Metro.
- preview: internal standalone APK with embedded bundle; requires real public HTTPS
  backend and Clerk public key. Release-config guard rejects missing/local endpoints.

Cloud path, after user login and explicit verification of free Android quota:

```powershell
cd apps/mobile
npx eas-cli@25.3.0 login
npx eas-cli@25.3.0 whoami
npx eas-cli@25.3.0 init
```

Review project creation/linking and account terms yourself. Verify free eligibility,
remaining Android quota and queue on Expo's dashboard. Do not submit if unverified,
exhausted, payment-required or paid. Add public config to the EAS build environment;
do not upload backend.env. Inspect the build archive first to confirm exclusions.

```powershell
npx eas-cli@25.3.0 build --platform android --profile development
# Once HTTPS and real auth configuration are verified:
npm run verify:release
npx eas-cli@25.3.0 build --platform android --profile preview
```

No build submission or free quota consumption occurred here. Never repeat failing
cloud builds blindly. The scripts-disabled install gate is intentional. Review and
allow only a demonstrably required install script if a future native dependency needs it.

Local fallback requires approved JDK17, Android Studio/command-line tools, platform37,
build tools selected by SDK58, platform-tools/adb and SDK licenses accepted by the user.
These are free official tools, but administrator/security approval and license acceptance
are user actions. Java8 alone cannot compile this project. Do not alter global Java8
or remove other SDKs; set JAVA_HOME/ANDROID_HOME to approved installations per terminal.

```powershell
cd apps/mobile
npm run verify:release
npx expo prebuild --platform android --no-install
npx expo run:android --variant release --no-install
```

Prebuild passed here; the build attempt failed because ANDROID_HOME/SDK/adb were
missing. No APK exists. Standard local release output, once built, is
`apps/mobile/android/app/build/outputs/apk/release/app-release.apk`; this is an expected
future location, not an artifact delivered in this execution. A locally generated
debug signing key is private and must not be committed. Use a stable approved signing
strategy before distributing/updating an APK. Preview EAS signing is managed in the account.

## Samsung Galaxy A35 verification

After obtaining a real APK, connect USB, enable Developer options/USB debugging and
accept the specific computer prompt on the phone. With approved platform-tools:

```powershell
adb devices
adb install -r PATH_TO_ACTUAL_APK
adb shell monkey -p com.provia.app 1
```

Confirm package/launch, Clerk browser callback, HTTPS backend, profile/goal persistence,
unknown-data dashboard, sign-out and app restart on the physical device. Capture only
safe error codes/request IDs in diagnostics; Android logs can contain personal data.
Full checklist: docs/sprint48-device-checklist.md. None of these device results is PASS yet.
