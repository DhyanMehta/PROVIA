# Phase 6 release readiness

30 October 2026. Branch `codex/first-party-auth`; starting commit
`fc58387401bcae9c874611718aeb280454ea5c52`. Release remains BLOCKED by native
toolchain/device and authenticated visual acceptance, deployment and real email.
Final local commit is available through `git rev-parse HEAD` and the completion message.

## Executed verification

| Check | Result |
| --- | --- |
| Mobile Jest |312 passed,27 suites,0 failures;66.476s; `.expo/phase6-jest.json` |
| TypeScript / ESLint |PASS |
| Actual HTTP/PostgreSQL integration |30/30 checkpoints,70 requests; fresh database migrated0007 then exact owned database removed |
| HTTP status assertions |200×37,201×18,202×2,204×1,401×3,404×6,409×3 |
| Ruff |PASS lint;129 files formatted |
| Frozen OpenAPI / endpoint inventory / generated contract check and typecheck |PASS |
| Expo Doctor |20/20 PASS |
| Android prebuild |PASS; generated configuration only |
| Hermes Android export |PASS; `.expo/phase6-android`,5.7MB bytecode |
| Public release configuration |PASS; URL shape only, not hosted revision |
| npm audit |3 high,13 low; reviewed in dependency-security report |
| Native Gradle / APK |BLOCKED; suitable JDK/SDK absent |
| Camera / SecureStore / deep links / Samsung A35 |Device acceptance NOT VERIFIED |

Counts are separate verification boundaries and are not added together. The HTTP
harness substitutes external email delivery and native credential storage only.
The full424-case backend pytest collection was verified in Phase5 (423 initial
passes plus one DNS setup retry); it was not rerun in Phase6 because backend code
is frozen. This phase reran the requested actual HTTP/database workflow. An initial
uv sandbox cache permission failure and an initial generic integration setup failure
were not passes; approved execution and the subsequent full workflow passed.

Native subagents audited Android, native integrations and functional UX; a follow-up
verification agent completed actual HTTP/database and contract checks. Saved edits
were recovered after interrupted workers and independently included in the full run.

## Verified local changes

Activity draft protection now survives subsequent edits after save. Water inline
edit/cancel and activity-day changes require draft confirmation. Confirming inline
discard no longer disables the next draft's navigation guard. Workout set/exercise/
plan inputs lock during pending or uncertain saves. New scanner regressions exercise
mount failure, denial, provider failure and cancellation. Auth empty-string children
and auth/onboarding header colors were corrected following rendered web inspection.
The integration harness now reports safe stage/category diagnostics without secret
exception text. Backend business code, migrations, generated contracts, EAS identity,
signing, existing database and phone data remain unchanged.

## Approval-only release procedure — not executed

1. Review remaining advisories and approve residual build-tool risk; do not force
   Zod4 into a CLI requiring3 or downgrade Expo to satisfy audit suggestions.
2. Follow `phase3-deployment-runbook.md` for Resend sender/domain permissions,
   sending-scoped credentials, encryption-key custody and controlled intake/worker
   activation. Keep secrets server-only. A202 is not delivery proof.
3. Follow `phase2-neon-readiness.md` and the Phase3 backup runbook: encrypted private
   dump, archive validation and actual restore to a separately verified empty target.
   Obtain approval and verify the intended direct target before any application write.
4. From `services/api`, only after backup/restore and explicit migration approval:

```powershell
python -m uv run --no-sync alembic current
# Require intended target at0004; stop on unexpected revision or any command failure.
python -m uv run --no-sync alembic upgrade 0005
python -m uv run --no-sync alembic current
python -m uv run --no-sync alembic upgrade 0006
python -m uv run --no-sync alembic current
python -m uv run --no-sync alembic upgrade 0007
python -m uv run --no-sync alembic current
python -m uv run --no-sync alembic check
```

5. Separately approve publication and Render deployment. Confirm auto-deploy state
   before pushing. Preserve existing service/free plan and approved environment.
   Build `bash scripts/render_build.sh`; start
   `.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port $PORT --no-access-log --no-proxy-headers`.
6. Verify deployed revision/OpenAPI against67paths/91operations and required Phase4
   schemas,0007, readiness/database,401/403 and controlled account flows. Existing
   older Render deployment is not source compatibility evidence. Run the existing
   `node scripts/check-sprint-backend.mjs https://provia-mag7.onrender.com/api/v1`
   after approval; smoke success alone does not prove email/schema compatibility.
7. After backend/email/risk acceptance and explicit EAS build approval, from
   `apps/mobile`: `npm run verify:release`, then
   `npx eas-cli@latest build --platform android --profile preview`.
   Preserve project4e131be3-7394-4883-ae44-498c63bfcac5, packagecom.provia.app,
   schemeprovia and existing signing identity. Do not recreate credentials.
8. Inspect downloaded APK identity/signature/version against installed preview.
   With authorized adb/device connection, install compatible update with
   `adb install -r <approved-preview.apk>`. On signature/version conflict stop;
   never uninstall or clear data to conceal incompatibility.
9. Execute `phase6-samsung-a35-test-plan.md` with dedicated approved test accounts,
   real inbox verification/reset, onboarding and measured manual fitness CRUD.
   Record build/API revision and actual results, including cold/warm links and restart.

No publication, live migration, deployment, paid service, cloud build, real email
activation, phone installation/reset or sensor upload was performed in this phase.
