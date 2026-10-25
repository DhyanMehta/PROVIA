# Real-device authentication and backend diagnosis

Date: 2026-10-26 (Asia/Calcutta).

Status: the user corrected Render's authentication settings, and the deployed smoke test now passes all four checks, including invalid-bearer 401. The packaged callback-routing gap is addressed in the verified source fixes in this commit; physical-device resolution remains unverified. The agent did not change Render/Clerk settings, credentials, application database records or phone data. No APK was rebuilt or submitted. The user authorized committing the verified fixes and requested the rebuild command only.

## Exact APK inspected

- File: `C:\Users\Dhyan\Downloads\application-6a47530a-d1d0-4852-8594-cd3b727825a4.apk`
- Size: 94,883,725 bytes.
- SHA-256: `57f476a640f52c848791c5f6145bd5c8f7c55ad3b66dec001d730081749f522e`.
- Package: `com.provia.app`; version `0.1.0`; versionCode `1`.
- Embedded API URL: `https://provia-mag7.onrender.com/api/v1` — correct.
- Embedded Clerk publishable key: development (`pk_test_`); exact match with local mobile configuration. Key value deliberately omitted.
- Clerk instance derived from that key: `https://busy-puma-466.clerk.accounts.dev`.
- Binary Android manifest registers VIEW/DEFAULT/BROWSABLE intents for `provia`, `exp+provia`, and `clerk://com.provia.app.hosted-callback`. MainActivity uses singleTask.
- Embedded Expo config includes Clerk and Router plugins, the `provia` scheme and correct Android package.
- Hermes bytecode contains the root `./index.tsx` module and hosted-auth flow. It contains no application `./+native-intent.ts[x]` module or custom `redirectSystemPath` function.

Inspection was static: ZIP members and binary Android XML were read, and the existing Hermes compiler disassembled bytecode without executing the app. Exact public configuration was checked against individual Hermes string-table entries, avoiding unreliable substring extraction from packed strings. Extracted inspection files are ignored under `apps/mobile/.expo/apk-inspection/`.

## Findings and confidence

### Backend: initial invalid JWKS location, correction verified

The initial public, read-only deployment checks produced:

| Request | Result | Request ID |
| --- | --- | --- |
| `GET /api/v1/health` | 200, healthy | `af6f55da-a49e-420e-9e19-b7da25b0c618` |
| `GET /api/v1/health/db` | 200, database healthy | `72e0bb4a-5f34-42a5-abe0-920678b73619` |
| `GET /api/v1/me`, no bearer | 401, expected | `a90e4502-45f2-4552-969f-1f05a977d189` |
| `GET /api/v1/me`, deliberately invalid non-secret bearer | 503, `AUTH_UNAVAILABLE` | `0beaf83a-45c4-4c63-bfb3-38fd0aced8f1` |

A second controlled request matched the backend's static message **Authentication configuration is invalid**, request ID `fab058a6-59f8-4872-abe1-c5406f10ab1e`.

In `services/api/app/core/auth.py`, this message is emitted when the resolved JWKS location is not a valid HTTPS URL with a hostname and without embedded credentials. This happens **before token parsing, key retrieval or signature verification**. Missing bearer credentials return 401 before this check, explaining why the original three smoke checks passed despite broken authenticated requests. These requests did not reach user provisioning or change application records.

This is an authentication configuration failure, not evidence that the backend or database is down. Render cold starts can cause separate delays, but the reproduced responses were fast (101–238ms) and do not support cold start as the cause of these 503s.

At initial diagnosis the local backend configuration also had an invalid JWKS location; its issuer matched the APK instance. That local snapshot is not treated as proof of Render environment values. The agent did not change local credentials.

After the user's Render correction, the same smoke script returned:

| Request | Result | Duration | Request ID |
| --- | --- | --- | --- |
| `GET /api/v1/health` | 200, healthy | 216ms | `44ab7806-69d3-4199-8eda-17f22c4c8e47` |
| `GET /api/v1/health/db` | 200, database healthy | 109ms | `000e7d87-e882-4d50-95ab-bfc492a3f64d` |
| `GET /api/v1/me`, no bearer | 401, expected | 207ms | `723c9a44-844a-43eb-8432-fc40639f6380` |
| `GET /api/v1/me`, deliberately invalid bearer | **401, expected; previously503** | 96ms | `5f289e5f-7b89-40d6-91bf-0b83ac67a224` |

This confirms that malformed-bearer requests reach token rejection instead of failing the JWKS URL configuration precheck. It does not establish successful signing-key retrieval, signature validation, issuer/audience/authorized-party compatibility or real-session acceptance: the deliberately malformed token is rejected before those later operations. No real bearer was sent.

### Routing: packaged callback is treated as a page

The APK has a root route and the correct native callback intent filter. Its installed Clerk SDK derives `clerk://com.provia.app.hosted-callback` and verifies callback state, PKCE and session redemption before activating the session.

The installed Expo Router URL parser was exercised with its native launch-URL unwrapping stubbed to identity:

| URL | Router path |
| --- | --- |
| `provia://` | empty path, corresponding to root |
| `clerk://com.provia.app.hosted-callback` | `com.provia.app.hosted-callback` |

No app page matches the second path, and the APK has no callback-routing rewrite. This establishes a callback-routing gap. Router's Unmatched screen constructs its displayed URL using `Linking.createURL(pathname)` and the app scheme; the displayed `provia://` is not a capture of the original incoming callback.

**Remaining uncertainty:** the device's exact incoming URL and timing have not been observed. A literal bare `provia://` cannot, by itself, be attributed to a missing root route. A Clerk dashboard override is still possible but not established. Do not label the SDK's session redemption as broken based solely on the Unmatched screen. No callback parameters were used to authenticate locally.

### Account connection screen

`src/app/index.tsx` renders “Connecting to your account” only after Clerk reports signed in. It waits for `loadSetup`: `GET /me`, then `GET /profile` (404 means no profile), then paginated `GET /goals`. This screen is distinct from the layout's “Restoring your secure session” state.

With the initially broken server configuration, a bearer request to `/me` received503 before subsequent setup requests. The installed client's generic message maps every5xx to “backend unavailable,” hiding the authentication cause. The corrected deployment now rejects invalid bearers with401. Actual device request logs have not been captured, so the exact phone request ID remains unknown.

## Corrected configuration and remaining compatibility checks

The user reports correcting these two separate Render settings to match the Clerk development instance used by the APK. The new smoke results confirm removal of the earlier URL-validation failure:

```dotenv
AUTH_ISSUER=https://busy-puma-466.clerk.accounts.dev
AUTH_JWKS_URL=https://busy-puma-466.clerk.accounts.dev/.well-known/jwks.json
```

The second URL was verified live: HTTP200, public RSA signing keys present, no private key material. This backend fetches the provider's public JWKS endpoint. A saved JSON file, filename, generated key, key ID or hash does not belong in `AUTH_JWKS_URL`. Do not generate replacement signing keys for Clerk-issued tokens.

`AUTH_AUDIENCE` is a separate expected `aud` claim; neither the issuer nor JWKS URL belongs there automatically. The app calls Clerk's standard `getToken()` without a custom JWT template. Inspect the actual session-token policy/claims privately before adjusting the audience setting: preserve an intentional audience restriction and ensure Clerk issues its matching `aud`. If standard tokens have no `aud`, use the backend's documented optional-audience configuration only after confirming that fact. An audience mismatch could cause a separate 401 after the JWKS location is fixed.

Similarly, compare any real `azp` claim with `AUTH_AUTHORIZED_PARTIES`; the backend rejects a present unauthorized party. Do not add `provia://` or `clerk://` as an HTTP origin, use wildcards, or disable existing validation to make login succeed. Whether actual tokens have the expected issuer, audience and authorized party remains unverified; no real JWT was obtained or printed.

In Clerk's Native applications settings, verify Native API is enabled and the Android application is `com.provia.app`, with the SDK's canonical callback `clerk://com.provia.app.hosted-callback`. The APK already includes its filter. Do not replace hosted auth's callback with a generic `provia://` homepage redirect. Only change an existing override if its mismatch is confirmed.

Official references: [Clerk hosted authentication](https://clerk.com/docs/expo/guides/account-portal/hosted-auth), [useHostedAuth callback behavior](https://clerk.com/docs/reference/expo/native-hooks/use-hosted-auth), [Clerk session claims](https://clerk.com/docs/guides/sessions/session-tokens), [Expo native-intent routing](https://docs.expo.dev/router/advanced/native-intent/).

## Finalized source fixes

These source fixes passed final local verification and are included in this fix commit. They are not present in the installed APK and have not been deployed through a build or update.

- `apps/mobile/src/app/+native-intent.tsx`: suppress Router navigation for the exact warm Clerk callback, preserving the original WebBrowser event for SDK verification; cold callback goes through root hydration. Normalize only bare PROVIA root links; unrelated routes keep normal matching.
- `src/app/_layout.tsx` and new `src/components/session-gate.tsx`: preserve hydration gating and show a bounded session-initialization diagnostic after 30s without clearing or manufacturing a session.
- `src/app/index.tsx` and `src/lib/onboarding.ts`: show setup stage and validate account/goal-history shapes while preserving generated contracts.
- `src/app/welcome.tsx`: distinguish SDK cancellation and incomplete activation; preserve SDK default callback and activation behavior.
- `src/lib/api-client.ts` and new `src/lib/api-diagnostics.ts`: distinguish auth rejection, 403, identity-provider/configuration failure, database readiness failure, timeout, token acquisition failure, network error, cancellation and invalid responses. Show allowlisted request method/route, HTTP status, phase, duration and sanitized request ID; never reflect tokens, response bodies, health data or arbitrary server messages. A single GET deadline covers token refresh and HTTP/body processing. Writes are never automatically retried; unreadable write success remains uncertain. Legitimate nullable activity responses remain supported.
- `src/hooks/use-resource.ts`: 120s whole-screen loading deadline covering sequential/paginated work; request-specific GET 90s/write 45s deadlines retained. A slow response is not asserted to be a proven Render cold start.
- `scripts/check-sprint-backend.mjs`: check all endpoints independently, report safe metadata, and exercise rejection of a deliberately invalid bearer so auth configuration faults cannot hide behind a passing no-token401.
- Regression tests: `src/lib/native-intent.test.ts`, `src/components/session-gate.test.tsx`, `src/hooks/use-resource.test.tsx`, plus extended `src/lib/api-client.test.ts` and `src/screens/flow.test.tsx`.

Existing user changes to `apps/mobile/app.json` (EAS project/owner) were preserved byte-for-byte and deliberately excluded from this commit. Backend application code, migrations, dependencies, lockfiles, credentials and generated API contracts are unchanged. File hashes also verified that `eas.json`, `render.yaml`, both local environment files, the backend lockfile and API schema were unchanged during this finalization.

## Verification

| Check | Result |
| --- | --- |
| Mobile tests | Fresh rerun: 66 passed, 8 suites; 0 failed/skipped; 30 more cases than the previous 36 |
| TypeScript | PASS |
| Mobile ESLint | PASS |
| Expo Doctor | 20/20 PASS |
| Public release configuration guard | PASS against current local configuration; exact APK values separately verified |
| Local Android Metro/Hermes export | PASS; JavaScript bytecode export only, not an APK rebuild |
| SQLAlchemy import | 2.1.6, `HAS_CYEXTENSION=False` |
| Full backend suite | Fresh rerun: 233 passed, including 33 PostgreSQL integration cases; 0 failed/skipped; 610.15s |
| Backend Ruff lint/format | PASS; 90 files already formatted |
| Credential scan | 0 matches across 214 candidate/export files |
| Independent source review | Required nullable-response finding fixed; no required findings remain |
| Mutation check | Removing callback rewriting made focused tests fail; source restored byte-for-byte |
| Deployed smoke | Fresh rerun: all four checks PASS; health/db200, no-bearer401, invalid-bearer401 |
| Real authenticated deployed request/device retest | NOT VERIFIED |

Backend command: `python -m uv run --no-sync python -m scripts.run_postgres_tests --junitxml=.pytest_cache/device-auth-final.xml`, run from `services/api`. The first attempt stopped before tests because it could not create/use a disposable database; diagnostic details were suppressed. A subsequent read-only direct `SELECT 1` succeeded, and the retry created a fresh disposable database, passed the complete suite and removed only that generated database. The initial setup failure is not counted as a test pass. No deployed data was reset or edited. No ordinary `uv sync` or Windows Application Control change was performed.

Fresh mobile command: `npm test -- --silent --json --outputFile=.expo/device-auth-final-tests.json`, run from `apps/mobile`, alongside `npm run typecheck`, `npm run lint`, `npx expo-doctor`, `npm run verify:release`, and local `npx expo export --platform android --output-dir dist/android`. Static deployment/archive safeguards and `git diff --check` passed. The source received independent review; no required findings remain. The previous callback mutation experiment failed as expected and restored the source byte-for-byte.

## Exact next verification sequence

1. The user's Render correction is verified through the now-passing smoke test; no migration is needed. Confirm audience and authorized-party settings against actual Clerk-issued claims privately, without sharing/logging the JWT.
2. The reusable command from the repository root is `node scripts/check-sprint-backend.mjs https://provia-mag7.onrender.com/api/v1`. It now returns health200, DB200, no-bearer401 and invalid-bearer401. This still does not prove real-token acceptance.
3. On the existing APK, reopen the app without clearing data. If the saved Clerk session is valid and settings align, account resolution can recover from the server-only configuration fix. Record only status, safe error category and request ID from Render logs; do not dump headers, tokens or response bodies.
4. After the routing/source fixes are accepted and a future preview build is explicitly requested, build from the verified source and install an update over the existing app using the same package/signature. No uninstall or data clear. The installed app has no configured OTA delivery path for these source changes; a new APK is needed to deliver them. Render-only environment corrections do not need a new APK.
5. Test warm hosted sign-in and cold restart separately on the A35. Verify the canonical callback avoids Unmatched Route, SDK session activation completes, and account setup reaches onboarding/dashboard. A callback after the OS kills an in-flight auth process may require restarting the SDK flow; do not redeem callback parameters manually.
6. Exercise cancellation, unavailable network, slow Render startup and denied sessions. Verify loading ends in a specific diagnostic with retry, and no automatic mutation retry or token/health-data logging occurs.

No real-device success is claimed. The corrected deployed configuration passes malformed-token rejection; real Clerk claims and device callback behavior still need verification.

## Preview APK rebuild command — provided only, not executed

From Windows PowerShell:

```powershell
Set-Location -LiteralPath 'D:\Dhyan\Self Projects\Provia\apps\mobile'
npx eas-cli@latest build --platform android --profile preview
```

The existing preview profile already sets `developmentClient:false`, `distribution:internal`, and `android.buildType:apk`. Preserve the current EAS project/owner, public build environment variables and Android signing credentials. Environment files are excluded from cloud archives; reuse the successful build's configured EAS variables for `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`. Do not depend on uploading `.env.local`. The command requests a cloud build when the user chooses to run it; it has not been run by the agent.

Install the future APK as an update using the same package/signature; do not uninstall, clear storage, or reset application data. Test hosted sign-in, SDK session activation, account setup and restart on the A35. This local verification does not replace that device test. [Official EAS APK build reference](https://docs.expo.dev/build-reference/apk/).
