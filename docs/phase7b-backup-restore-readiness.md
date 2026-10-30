# Phase 7B backup/restore readiness

30 October 2026, Asia/Calcutta. Preparation only, starting revision
`1c9ed2b82283b8b121ba55abb04ded5382fd4a64`. No backup, restore, database creation,
deletion, migration, deployment, email activation or security-setting change occurred.

## Evidence and execution gates

| Item | Result | Classification |
| --- | --- | --- |
| PostgreSQL tools | Existing absolute bin paths, file version18.4; all three previously executed `--version` successfully in this session history; files reconfirmed | VERIFIED |
| Client/server compatibility | Client18/server18; recent read-only direct check returned0004 | VERIFIED, historical current-session evidence, not a new query |
| Direct configuration | Existing `DIRECT_DATABASE_URL` connected successfully earlier; route suitability/Neon endpoint identity still needs private confirmation | PREPARED; endpoint independence NOT VERIFIED |
| Actual Render application target | No authorized Render configuration access available; local environment is not proof of live identity | REQUIRES OPERATOR ACTION |
| Encrypted private directory | None selected; read-only BitLocker query unavailable/access denied | REQUIRES OPERATOR ACTION |
| Private libpq files | PGSERVICEFILE/PGPASSFILE unset in inspected process; no selected directory/files verified | REQUIRES OPERATOR ACTION |
| Empty disposable restore target | None separately approved or identified; no old test database reused | REQUIRES APPROVAL |
| Backup/restore commands | Prepared in companion execution plan; no data operation executed | PREPARED |
| Migration source |0004→0005→0006→0007, exactly one static head0007 | VERIFIED by source inspection |
| Alembic executable check |Blocked by Windows Application Control4551 | BLOCKED |
| Operator privileges | Source all-table read, destination CREATE/extension privileges and directory ACLs not verified | REQUIRES OPERATOR ACTION |

No assertion that a non-pooler variable name alone proves a direct Neon endpoint.
Privately compare exact source endpoint/database/role and TLS settings with approved
Render and Neon configuration; derive pooled/direct correspondence from actual Neon
endpoint metadata, not blind string replacement. Never print those values in reports.

## New Application Control evidence

Attempted command from `services/api`:
`python -m uv run --no-sync alembic heads`.
Actual result: exit1, `Failed to spawn: alembic`,
`An Application Control policy has blocked this file. (os error 4551)`.
Existing project launcher resolved at
`D:\Dhyan\Self Projects\Provia\services\api\.venv\Scripts\alembic.exe`.
The tool message named the command, not a full policy-event path; administrator
Code Integrity correlation must confirm the denied file/dependency. No alternate
module entry point, copied/renamed binary or policy exception was attempted.
Resolved launcher SHA256:
`5C689FDF6F746892EE36FA6934AA35944B932A541CA7D9960A8CAC735D565975`.

Ask the authorized administrator to inspect Event Viewer → Applications and Services
Logs → Microsoft → Windows → CodeIntegrity → Operational around the attempt
(30 October2026, approximately19:08 Asia/Calcutta). Preserve exact event path, ID,
policy ID, timestamp, file hash/signature and signer details privately. Approve the
specific required existing tool only through the organization's normal mechanism.
No command to weaken policy is part of this plan.

## Migration review

-0005 creates five auth tables with UUID relationships, indexes, uniqueness/check
  constraints. Legacy user IDs/history are retained; no email-based legacy enrollment.
-0006 adds encrypted durable auth email jobs, lease/state constraints and indexes;
  no worker activation or mail configuration follows from applying the schema.
-0007 adds request_receipts plus weight source/external_id and constraints. Existing
  weight rows receive source=manual and external_id=null; nutrient/goal/meal snapshots
  are not recalculated. The new default/constraints can lock/scan existing data;
  measure rehearsal duration and review lock/timeout budgets before execution.

Static inspection of all seven revision definitions found sole head0007; this is
not represented as a successful executable `alembic heads` check. Source chain and
existing Phase5/6/7 owned-disposable-database0007 evidence support rehearsal readiness.
No new database tests ran here because creation/data writes are not authorized.
Metadata check belongs at final0007, not intermediate0005/0006 against0007 models.
Never downgrade populated auth/outbox/receipt tables as rollback.

## Exact remaining actions

Follow `phase7b-private-operator-checklist.md`, then review the execution plan.
Record verified private storage, independent source identity, approved empty target
and least required operator privileges. Obtain administrator approval for the
blocked migration launcher. Obtain separate source-backup execution approval,
restore-target creation approval if needed, restore execution approval, restore
acceptance and application-migration approval. Render deployment is a later approval.

SECURE BACKUP STORAGE: NOT VERIFIED.
APPLICATION DATABASE IDENTITY: NOT INDEPENDENTLY VERIFIED.
RESTORE TARGET: NOT AVAILABLE (no separately approved target supplied).
MIGRATIONS 0005–0007: BLOCKED for execution; source review complete.

This document and the two Phase7B companions refine the older Phase7 preparation
report. Older runbooks remain historical: no old0005-only drift check or PATH-only
tool assumption overrides this review. Application source/migrations are unchanged.

## Local documentation verification

All five PowerShell fenced templates parsed using the Windows PowerShell parser:
zero syntax errors, no template command executed. Git whitespace check passed;
no application/migration/generated-contract changes. Syntax validation does not
prove private paths, connections, privileges, archive creation or successful restore.
No application tests were rerun for documentation-only changes and no database
rehearsal was attempted under preparation-only authorization.
