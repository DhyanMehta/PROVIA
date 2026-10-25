# Sprint48 execution1 preflight

Date:2026-10-25 (Asia/Calcutta). Starting commit8d65207; working tree was clean.
Read Day3 report, frontend/Health Connect integration, operations, API inventory and
contracts README. apps/mobile contained only.gitkeep. No Git remote is configured.

## Inventory and blockers

- Node22.22.2/npm10.9.7 available. Only Java8 detected; javac/Android SDK/Gradle/adb/EAS
  CLI absent from PATH. No SDK at the normal LOCALAPPDATA Android/Sdk location.
- Initial disk free: approximately96GB C:,490GB D:.
- Backend regression attempt via `uv run --no-sync python -m scripts.run_postgres_tests`
  failed before starting Python: Windows Application Control, os error4551. Exact
  blocked launch target: `D:\Dhyan\Self Projects\Provia\services\api\.venv\Scripts\python.exe`.
  No interpreter/dependency replacement or security-policy change was attempted.
- Current SQLAlchemy import, backend startup and migration/current cannot be reverified.
  Last verified Day3:233 passed/33 PostgreSQL, SQLAlchemy2.1.6 without C extensions,
  migration0004 and21 application tables. These are historical results, not this run's PASS.
- No Render/Expo credential variables or authenticated browser tabs were available.
  The user chose **prepare deployment only** and **prepare account setup instructions**;
  can connect Samsung by USB. No resources, billing, DB grants or cloud builds created.

## Official compatibility/free-tier assessment

Registry verified Expo58.0.19/create-expo-app5.0.0, @clerk/expo4.14.1 and EAS CLI25.3.0.
[SDK58](https://docs.expo.dev/versions/v58.0.0/) targets RN0.88/React19.3, Node22.13+,
Android compile37/target36. Node is compatible. Official scaffold supplies exact SDK
package ranges; independent apps/mobile npm lockfile and install-script gate retained.

[Clerk Expo](https://clerk.com/docs/expo/getting-started/quickstart) supports hosted
auth, SecureStore tokenCache, config-plugin callbacks and Expo>=54<59. Native API
must be enabled by the owner; real client account/session unavailable here.

[EAS Free pricing](https://expo.dev/pricing) advertises15 Android/15iOS builds monthly,
low-priority queue. Actual account plan/quota/queue unverified; no build submitted.
Standalone preview APK and Metro-dependent development-client APK are separate profiles.

[Render Free](https://render.com/docs/free) supports Python/HTTPS,750 workspace free
instance-hours monthly,15-minute idle sleep, roughly one-minute cold startup. Build
and bandwidth allowances are workspace-specific. A saved card can enable overage
billing; without payment method excess limits suspend. Stop on any payment/card/paid
requirement. No auto-trial or upgrade. Free is suitable for this private test, not a
production-readiness claim. [FastAPI deployment](https://render.com/docs/deploy-fastapi)
supports0.0.0.0/$PORT. [Python version](https://render.com/docs/python-version) is pinned
to3.12.15; Linux lock installation is separate from the repaired Windows environment.

[Neon Python guide](https://neon.com/docs/guides/python) requires a secure connection;
existing settings normalize Neon TLS and separate pooled runtime/direct migrations.
User did not approve hosted access to existing DB. No database change/write was made.

[react-native-health-connect v4](https://github.com/matinzd/react-native-health-connect)
includes its Expo plugin, requires a custom build, API26+, and cannot run in Expo Go.
SDK58 architecture/minSdk26 permits later integration; broad peers do not prove RN0.88
compilation/device compatibility. No Health Connect permissions or sync UI are added
yet. Android14+ includes Health Connect; supported older devices need the provider.

## Checklist

- [x] Existing repository/docs/tooling/free-service audit.
- [x] Render configuration and manual deployment path prepared.
- [x] Expo foundation, hosted Clerk integration and generated contract client implemented.
- [x] Profile/weight/goal-preview/confirmation/dashboard flow implemented.
- [x] Android native prebuild and JavaScript/Hermes export verified.
- [x] Final mobile tests/typecheck/lint/Doctor/bundle/config checks and independent review.
- [x] Secret/bundle scan; upstream advisories explicitly documented as unresolved.
- [ ] Real hosting/Clerk/device verification: external steps, not simulated PASS.
- [ ] APK compilation: blocked until an approved SDK/JDK or free EAS account is available.

Authorized approval evidence for Windows administrator: Code Integrity Operational
event3077 and related3089 signature evidence at the failed launch time, including
file path, policy identifier, signature/hash and process chain; AppLocker8004 if that
system governs execution. Do not disable policy, remove blocked binaries or choose
another Python binary to evade it. Re-run the original commands after authorized approval.
