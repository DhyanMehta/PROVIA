# Phase 6 dependency security review

30 October 2026. Official npm audit reports 16 affected dependency entries: 3 high,
13 low, zero moderate/critical. These propagate from two underlying advisories;
they are not sixteen independent vulnerabilities. Evidence: ignored
`apps/mobile/.expo/phase6-audit.json`. Initial sandbox DNS failure was retried with
approved official-registry access.

| Dependency and paths | Prerequisites and reachability | Compatible resolution |
| --- | --- | --- |
| zod3.25.76 via Expo58.0.21 → @expo/cli58.1.17; also ESLint hooks tooling | Untrusted oversized constrained collections can exhaust validation memory. CLI dev-tools extension schemas accept collections. This is build/dev tooling, not a direct application API validator. Do not expose Metro publicly or consume untrusted plugins/configuration. | Advisory names4.6.6 patched, but CLI requires ^3.25.76; forcing4 is an unsupported major substitution. Wait for a supported upstream CLI patch. |
| deepmerge4.3.1 via @expo/config58.0.9 and Jest30.5.2 → jest-config | Attacker-controlled merge keys can poison the returned object's prototype. Config/plugin modifications and Jest configuration are the relevant inputs; trusted repository/config review is required. No application health-data merge import identified. | Official advisory lists no patched version; current registry version4.3.1. No supported fix demonstrated. |

Propagated high entries: zod, @expo/cli, expo. Low entries: deepmerge,
@expo/config, @expo/local-build-cache-provider, @expo/metro-config,
@expo/prebuild-config, @jest/core, @testing-library/react-native, expo-router,
jest, jest-cli, jest-config, jest-expo, jest-watch-typeahead.

Native Android compilation is not blocked by an advisory assertion, but builds execute
affected tooling. Package dependency classification alone does not prove inclusion in
the application runtime. No direct source import of these validators/merge functions
was identified; this is a reachability assessment, not a proof of absence from every
artifact. Recheck upstream resolution and explicitly accept residual tooling risk
before build/release. No forced downgrade, audit suppression or unsafe override applied.

Sources: [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5),
[deepmerge advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).
