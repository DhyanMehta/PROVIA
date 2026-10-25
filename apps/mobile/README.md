# PROVIA Android foundation

Expo SDK58 / React Native0.88, TypeScript and Expo Router. This app implements the first profile-to-dashboard flow using existing generated backend contracts. Other feature routes explicitly show that they are coming next.

From apps/mobile:

```powershell
npm ci --ignore-scripts
npm run typecheck
npm run lint
npm test
npm start
```

Set only EXPO_PUBLIC_API_URL and EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in ignored .env.local. Missing configuration displays a setup state; no fake backend or token is supplied. Standalone builds require a verified public HTTPS API.

Clerk hosted authentication uses its supported SecureStore token cache and config plugin. Goal writes also keep an encrypted, account-scoped pending intent so unknown outcomes cannot silently repost. No backend secrets belong in this app.

See ../../docs/sprint48-deployment.md for account, APK and device instructions; ../../docs/sprint48-device-checklist.md for real verification. Native prebuild and JavaScript bundle export are not proof of an APK or physical installation. Backend application-control approval, real account configuration, SDK/JDK or a verified free EAS quota are still needed.

Development APK requires Metro; preview APK is standalone. Health Connect v4 integration is planned for execution2 and requires a custom native build. The current architecture supports that path without requesting health permissions yet.
