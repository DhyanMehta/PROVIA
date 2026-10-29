# Phase 5 verification report

29 October 2026. Branch `codex/first-party-auth`, starting commit
`ac659910cf1855ae1ee652e0ff8eba445537e3a6`. This report distinguishes mocked
unit/component checks, actual HTTP/database checks and unperformed device acceptance.

## Final local results

| Check | Actual result |
| --- | --- |
| Mobile unit suites (`*.test.ts`) | **177 passed**,14 suites |
| Mobile component/hook suites (`*.test.tsx`) | **125 passed**,13 suites; native/HTTP boundaries mocked where documented |
| Entire mobile collection | **302 passed**,27 suites,0 failed,0 pending;36.546s; baseline142 grew by160 cases |
| Real mobile-client/FastAPI/PostgreSQL integration | **30/30 checkpoints passed**,70 actual HTTP requests; no HTTP handlers/fetch replies mocked |
| Frozen backend collection | **424 distinct cases verified:348 unit +76 PostgreSQL**, with the initial DNS setup error and targeted retry described below |
| Mobile TypeScript | PASS, `tsc --noEmit` |
| Mobile ESLint | PASS, no source errors/warnings; generated `.expo`,Android/iOS and distribution trees excluded |
| Expo Doctor | **20/20 PASS** after reviewed SDK58 patch alignment |
| Android prebuild | PASS, local `--platform android --no-install`; generated camera/provia intent configuration inspected |
| Hermes Android export | PASS, final5.7MB bytecode bundle, `.expo/phase5-android`; no APK submitted |
| Native Gradle/APK compile | **BLOCKED**, no suitable verified JDK/Android SDK/adb; not passed by prebuild/export |
| Backend Ruff | PASS lint;128 files already formatted |
| New Python integration runner | Ruff lint/format PASS; CJS syntax and scoped ESLint PASS |
| Frozen OpenAPI/endpoint inventory | PASS; application export matches committed artifacts |
| Generated contract check/typecheck | PASS;67 paths/91 operations remain frozen |
| Standalone public-config validation | PASS; configured HTTPS `/api/v1` shape, not proof of live backend revision |
| npm audit | **3 high +13 low**,0 critical/moderate;16 advisory entries remain a release risk |
| Configured credential scan |0 matches in156 changed/new files scanned; only filenames/counts emitted, no configured secrets printed |
| Git whitespace check | PASS |
| Rendered visual inspection | **NOT EXECUTED successfully**; computer-use safety stop, no accepted screenshots |
| Samsung A35 / camera / Health Connect acceptance | **NOT VERIFIED**; no phone changes or cloud build |

The mobile JSON evidence is ignored `.expo/phase5-jest.json`, with a final302-case
collection and the split above obtained from its suite paths. Scoped agent counts
overlap this collection and are not added to it. Existing suites remain in the
collection; setup fixtures were updated to the authoritative `/onboarding` contract.

## PostgreSQL result and honest retry reconciliation

The complete no-sync backend run collected424 cases and finished with **423 passed,
one setup error**, in1630.77s. The error was `psycopg.OperationalError` / Errno11001
while resolving the database host in the setup of
`tests/integration/test_phase4_fitness.py::test_legacy_active_rows_remain_accessible_without_rewriting`.
No assertion or application request ran for that case. The generated test database
was removed by the runner.

The exact case was rerun in a newly generated disposable database: **1 passed in17.00s**,
and that database was removed. Reconciliation of JUnit classname/name identifiers
confirms424 collected,76 integration,423 initial passes,1 matching retry pass and0
remaining unverified cases. This is **not** represented as a clean424-pass single run.
One pre-existing pytest warning concerns `record_property` with xunit2 metadata;
it is not a test failure.

Ignored evidence: `services/api/.pytest_cache/phase5-final.xml`,
`phase5-final-run.log`, `phase5-postgres-retry.xml` and `phase5-postgres-retry.log`.
No prior/unknown test database was removed by prefix matching. The existing application
database and frozen migrations were not changed.

## Actual HTTP integration

The strengthened final run uses the actual `createApiClient`, `createAuthSession` and
frontend runtime validators against local FastAPI and PostgreSQL. Its70 requests
yielded asserted status counts: **200×37,201×18,202×2,204×1,401×3,404×6,409×3**.
The fresh test database reached migration0007 and was removed afterward.

Registration, supervised outbox processing, verification, login, rotation/restore,
authoritative onboarding, server calculations/goals/receipt replay, custom food/search/
quantity preview, meal create/edit/delete/snapshots, immutable recipe, seven-day plan,
active workout/sets/completion/history/actual records, weight/goal preview/apply/stale409,
water/target, full manual activity, sleep duration, unified dashboard/progress, profile
preferences, logout/401 and a second account's404 isolation checks all passed.

Only **external email delivery** and **native credential storage** are substitutes:
an in-memory controlled delivery sink and an `AuthStorage` adapter. The actual durable
outbox/worker and session controller still execute. This does not prove email arrival,
Android SecureStore or native UI end-to-end behavior. See
`frontend-phase5-local-integration.md` for all30 checkpoints and runner isolation.

Actual database testing caught valid PostgreSQL zero serialization (`0E-8`) that
mocked decimal fixtures missed. Nutrition/profile/progress validators, display expansion
and initial goal-deficit handling were corrected with regressions. No backend formula
or response shape was changed to satisfy a frontend validator.

## Commands

```powershell
# apps/mobile
npm test -- --silent --json --outputFile=.expo/phase5-jest.json
npm run typecheck
npm run lint
npm run verify:release
npx --no-install expo-doctor
npx --no-install expo prebuild --platform android --no-install
npx --no-install expo export --platform android --output-dir .expo/phase5-android
npm audit --json

# services/api — preserve the approved pure-Python SQLAlchemy installation
python -m uv run --no-sync python -m scripts.run_postgres_tests --junitxml=.pytest_cache/phase5-final.xml
python -m uv run --no-sync python -m scripts.run_postgres_tests tests/integration/test_phase4_fitness.py::test_legacy_active_rows_remain_accessible_without_rewriting --junitxml=.pytest_cache/phase5-postgres-retry.xml
python -m uv run --no-sync python ../../apps/mobile/scripts/phase5-local-integration.py
python -m uv run --no-sync ruff check .
python -m uv run --no-sync ruff format --check .
python -m uv run --no-sync python -m scripts.export_openapi --check
python -m uv run --no-sync python -m scripts.export_endpoint_inventory --check

# packages/api-contracts
npm run check
npm run typecheck
```

Python remains3.12.15, SQLAlchemy2.1.6 with `HAS_CYEXTENSION=False`. No ordinary
`uv sync` was run. The initial sandboxed Hermes attempt could not write its temporary
bytecode file; the same local export succeeded with approved filesystem access. This
was not an Application Control bypass. No native policy was weakened.

SDK58 alignment moved Expo58.0.20→58.0.21, RN0.88.0→0.88.1 and the explicitly required
coupled patch packages. Official SDK58 changelogs were reviewed first, including
[Expo](https://github.com/expo/expo/blob/sdk-58/packages/expo/CHANGELOG.md),
[Router](https://github.com/expo/expo/blob/sdk-58/packages/expo-router/CHANGELOG.md) and
[native UI](https://github.com/expo/expo/blob/sdk-58/packages/expo-ui/CHANGELOG.md).
The SDK major, EAS owner/project, package, scheme, icons and signing identity remain.
No forced audit fix/downgrade or compatibility-check exclusion was used.

## Acceptance limits

No real email arrival, deployed Render cutover, application migration, native Gradle
compile, cloud APK build, installation, phone-data reset, real camera scan, Health
Connect read/sync, rendered-native screenshot review, TalkBack or physical-device
success is claimed. The inspected Java shim reports8.0.4910.10; JAVA_HOME,
ANDROID_HOME and ANDROID_SDK_ROOT are unset, default SDK absent and adb absent from PATH.
The visual attempt stopped because computer use could not verify the current browser
URL; it was not retried through a different control path.

Those gates, the older deployed backend, real email/data prerequisites and dependency
advisories are listed in `frontend-phase5-remaining-work.md`. Manual source workflows
are locally verified; overall frontend acceptance remains **PARTIAL**.
