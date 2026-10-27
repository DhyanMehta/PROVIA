# Phase 3 dependency audit

Reviewed 27–28 October 2026. This records returned command results, not a claim that
every dependency is free of vulnerabilities. Audit artifacts are ignored under
`apps/mobile/.expo` and `services/api/.pytest_cache`.

## Results and compatible remediation

The historical Phase 2 count was five high-severity affected-package entries.
The fresh Phase 3 audit initially returned **four high entries**, zero critical:
`expo`, `@expo/cli`, `node-forge`, and `zod`. Advisory metadata and transitive
attribution changed; the old count is not presented as a new measurement.

Applied the supported transitive update with install scripts disabled:

```powershell
Set-Location 'D:\Dhyan\Self Projects\Provia\apps\mobile'
npm update node-forge --ignore-scripts
```

That first security update changed exactly one package: **node-forge 1.4.0 → 1.4.2**.
Both parent ranges were `^1.4.0`, so the new version fits their declared contracts.
No direct Forge dependency, override, forced fix or install-script exception was
introduced. The subsequent SDK-coherence updates below also change the lockfile.
Android identity, signing configuration and EAS project remain unchanged.

The [maintainer changelog](https://raw.githubusercontent.com/digitalbazaar/forge/main/CHANGELOG.md)
documents the RSA nested-DigestAlgorithm fix in 1.4.1 and a Buffer-input compatibility
fix in 1.4.2, documented in the maintainer's 27 October 2026 releases. The older
[advisory page](https://github.com/advisories/GHSA-86w9-cpqp-85rv) still lists no
patched version, while the current npm advisory range is `<=1.4.0`. The report uses
the maintainer's release notes and the observed post-update audit; it does not
infer that every possible Forge issue is resolved.

Post-update `npm audit --json`: **three high entries**, zero critical/moderate/low,
exit 1. Remaining entries are `zod`, `@expo/cli`, and `expo`, representing the same
[Zod collection-exhaustion advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
Installed Zod is 3.25.76; the published fix is 4.6.6 or later. Expo CLI and the lint
tool chain require 3.x. A major override is not a supported compatible fix.

The official Expo compatibility check subsequently required four same-SDK patches:
`@expo/ui` 58.0.24, `expo` 58.0.20, `expo-dev-client` 58.0.16 and `expo-router`
58.0.27. The coordinator approved those updates to restore SDK coherence. Following
the [SDK 58 reference](https://docs.expo.dev/versions/v58.0.0/) and
[Expo's upgrade guidance](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/):

```powershell
$env:npm_config_ignore_scripts='true'
npm exec expo -- install '@expo/ui@~58.0.24' 'expo@~58.0.20' 'expo-dev-client@~58.0.16' 'expo-router@~58.0.27' --npm
npm exec expo -- install --check
```

Installation and the final compatibility check exited 0. Expo's installer reran
the remaining three packages under the newly installed CLI as expected. No
dependency-validation exclusions were added. `package.json` changes only those
four version ranges. The final lockfile has 31 existing package-version changes
including SDK-owned transitive/native-tooling packages and Forge, with no added or
removed package entries. All installation scripts remained disabled. Native
prebuild/export and application verification are the coordinator's final gates.

This coherence update does not close Zod: new CLI 58.1.16 still declares
`^3.25.76`, confirmed by registry metadata. No SDK downgrade or Zod major override
was attempted. Final Expo is **58.0.20**, still SDK 58.

Remaining reachability is development/build/lint configuration processing. Public
FastAPI authentication does not use these Node validators. Treat the tooling path
as reachable: do not feed it untrusted or oversized configurations. A compatible
upstream fix or explicit reviewed release-risk acceptance remains required before
a cloud build. Recheck before any build and by **2 November 2026**.

## Returned verification

| Command | Actual result |
|---|---|
| Pre-update mobile `npm audit --json` | 4 high, 0 critical; exit 1 |
| `npm update node-forge --ignore-scripts` | 1 package changed; exit 0 |
| `npm ls node-forge` | Expo CLI and code-signing package share 1.4.2; exit 0 |
| Four-package same-SDK Expo install, scripts disabled | Supported matrix patch update; exit 0 |
| Final `npm exec expo -- install --check` | Dependencies up to date; exit 0 |
| Final mobile `npm audit --json` (refreshed 28 October) | 3 high, 0 critical; exit 1 |
| Final `npm audit signatures` | 1307 verified signatures, 315 verified attestations; exit 0 |
| Locked Python runtime `pip-audit` (refreshed 28 October) | 77 packages, no known vulnerabilities; exit 0 |
| API-contract tooling `npm audit --json` | 0 findings; exit 0 |

Python pins were freshly exported with `python -m uv export --locked --no-dev
--no-hashes --no-emit-project --format requirements-txt` and audited through the
isolated uv tool runner with the existing project interpreter, `--disable-pip` and
`--no-deps`. There was no project `uv sync`, interpreter replacement or SQLAlchemy
wheel restoration. All application Python execution must continue using
`python -m uv run --no-sync ...`.

The coordinator records final TypeScript, lint, mobile, Expo Doctor, API-contract,
credential-scan and backend/PostgreSQL results after integration. This specialist
does not claim those unexecuted checks as its own.
