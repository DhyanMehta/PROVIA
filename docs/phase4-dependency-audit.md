# Phase 4 dependency and release audit

Reviewed 28 October 2026 against the existing committed Python/npm lockfiles. No
dependency, interpreter, lockfile or installation-script policy was changed in this
phase. These are actual audit results; a failed registry request is not a clean audit.

| Scope | Returned result | Evidence |
| --- | --- | --- |
| Locked backend runtime | 77 applicable packages, zero known vulnerability findings; exit0 | `services/api/.pytest_cache/phase4-python-audit.json` |
| API-contract tooling | Zero findings; exit0 | `services/api/.pytest_cache/phase4-contract-audit.json` |
| Mobile/Expo tooling | **3 high, 13 low, zero critical/moderate; 16 affected-package entries**; native npm audit exit1 | `apps/mobile/.expo/phase4-audit.json` |
| Mobile registry signatures | 1307 verified signatures,315 verified attestations; exit0 | Returned `npm audit signatures` output |

The initial sandbox npm audits failed DNS resolution and their failed JSON artifacts
were retained separately. Escalated read-only registry retries produced the results
above. The initial uv cache write failed in the sandbox; authorized execution outside
that restriction exported/audited the lock without synchronizing the project. The
Python audit used an isolated audit-tool environment with the existing approved
Python interpreter; it did not replace source-built SQLAlchemy or run ordinary uv sync.

Commands executed (working directory as shown; paths contain no credentials):

```powershell
# services/api
python -m uv export --locked --no-dev --no-hashes --no-emit-project --format requirements-txt --output-file .pytest_cache/phase4-audit-requirements.txt
python -m uv tool run --python .venv/Scripts/python.exe pip-audit --disable-pip --no-deps -r .pytest_cache/phase4-audit-requirements.txt --format json --output .pytest_cache/phase4-python-audit.json
# apps/mobile and packages/api-contracts, each independently
npm audit --json
# apps/mobile, read-only installed paths/registry metadata
npm ls deepmerge zod --all
npm view deepmerge version
npm audit signatures
```

`pip-audit --no-deps` warned that fully hashed inputs are preferable. The inputs were
fresh pinned runtime exports from `uv.lock`, and the audit evaluated77 applicable
packages. This vulnerability check is not a hash/provenance attestation or a claim
that newly undisclosed vulnerabilities cannot exist. Subsequent application commands
must continue using `python -m uv run --no-sync`.

## Remaining advisories and release implications

| Advisory | Installed/reachable context | Supported remediation / disposition |
| --- | --- | --- |
| [Zod collection resource exhaustion](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) | Zod3.25.76 in Expo CLI and ESLint configuration validation. Native npm marks zod, @expo/cli and expo high. | Advisory patch4.6.6 is outside the declared3.x toolchain contract. No forced major override or SDK downgrade. Existing Phase3 deferred-risk decision remains; recheck/obtain reviewed acceptance before a cloud build and by2November2026. |
| [deepmerge returned-object prototype poisoning](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) | deepmerge4.3.1 via @expo/config and jest-config. Installed sources call it when merging app/plugin configuration and Jest presets/globals; npm propagates13low affected-package entries through the Expo/Jest/testing graph. | Official advisory lists affected4.2.0–4.3.1 and no patched release; current registry latest is4.3.1. Do not accept untrusted config/plugin/preset objects. Await a compatible upstream patch; recheck before any build and by2November2026. |

The deepmerge advisory metadata was updated27October2026. Its appearance in the fresh
audit changes the Phase3 total; this is not evidence that Phase4 introduced or changed
the dependency. Affected-package counts include transitive parents, not16independent
backend vulnerabilities. The exposed Python API does not import these Node validators;
their identified tooling paths remain reachable during development/testing/builds.
That distinction does not dismiss them or certify an unexamined APK bundle as safe.

Native npm suggestions included substantial Expo/Jest/testing-library downgrades.
Those are not compatible automatic remediations. No `npm audit fix --force`, major
Zod override, manual node_modules patch, blanket script approval or ignored finding
was used. The previously supported Forge1.4.2 correction is retained.

Do not process arbitrary oversized/untrusted configuration or merge attacker-supplied
objects in this toolchain. Keep project/plugin provenance controlled. A compatible
upstream fix or explicit release-risk review is required before EAS publication.
Local backend contract readiness remains separate from cloud build/production approval.

All raw audit files are ignored local artifacts and contain no application credentials.
The final test report records the coordinator's backend/PostgreSQL/mobile/Expo results;
this document does not substitute audits for functional or device acceptance.
