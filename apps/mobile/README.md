# PROVIA Android foundation

Expo SDK58 / React Native0.88, TypeScript and Expo Router. First-party authentication
replaces the hosted provider. Existing onboarding and canonical nutrition previews
remain; six tabs expose dashboard, nutrition, workouts, tracking, progress and profile.

From apps/mobile:

```powershell
npm ci --ignore-scripts
npm run typecheck
npm run lint
npm test
npm start
```

Set only `EXPO_PUBLIC_API_URL=https://provia-mag7.onrender.com/api/v1` in ignored
`.env.local` and the EAS preview environment. Never expose signing secrets, database
URLs, email API keys or passwords through Expo public variables.

Refresh credentials use expo-secure-store; access tokens stay in memory. Refresh is
single-flight, and uncertain rotations require sign-in rather than replay. Logout
clears local state and revokes the server family, with a signed-out retry action for
cleanup/revocation failures. Goal writes retain their encrypted account-scoped pending
intent. Pending email verification cannot open fitness routes.

See [current auth and cutover runbook](../../docs/first-party-auth-completion-report.md).
The new backend and revision0005 must be approved and deployed before this app can
authenticate. Email delivery is not configured. Native prebuild/Hermes export do not
verify an APK or physical installation. Existing EAS identity/signing is retained.

Fitness pages use existing APIs and honest loading/empty/error states. Food search
is read-only; meal entry, workout logging and device synchronization controls remain
future UI work. Unimplemented controls are visibly disabled.

Development APK requires Metro; preview APK is standalone. Health Connect v4 integration is planned for execution2 and requires a custom native build. The current architecture supports that path without requesting health permissions yet.
