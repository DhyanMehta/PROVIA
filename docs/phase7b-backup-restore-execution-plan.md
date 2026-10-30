# Phase 7B operator-only execution plan

30 October2026. **NOT EXECUTED.** Proposed commands contain no private values.
This repository copy is a review template. Before future execution, keep the filled
copy, logs, inventories and archive in verified encrypted operator-only storage.
Do not run this document wholesale; each section has a separate approval gate.
Current gate statuses are in `phase7b-backup-restore-readiness.md`.

## 1. Establish identity and consistent comparison window

Verify source matches approved actual Render/Neon database independently. Verify
direct endpoint, major18 and revision0004. Verify private directory/encryption/ACLs,
source all-table read privileges, available disk space and file templates per the
private checklist. Inspect user-defined objects/extensions and trust of source DDL
before restore. A dump can execute source-defined code on the target.

Agree an application write-free window covering source inventory, dump and comparison,
or design and verify an exported repeatable-read snapshot shared by inventory/dump.
The template below assumes the **write-free window**, including worker and other
clients. Coordinating/pausing a live service requires separate approval. pg_dump's
own consistent snapshot does not make an independently captured inventory consistent.
If any writes occur, stop acceptance and reconcile/repeat under approval; do not
silently compare stale data. Reassess backup freshness before migration.

Privately capture source schema inventory, revision, table/sequence counts, stable
UUID membership, relationships, FK validation baseline and canonical selected
historical goals/meals/items/nutrient snapshots. Extend comparison to weights,
workout plans/sessions/sets, water/activity/sleep, recipes and existing auth objects
if any. Use stable ordering and exact decimal/null/timestamp semantics. Store raw
comparison material privately; share only pass/discrepancy categories. No source
data/inventory extraction is authorized in Phase7B.

## 2. Separately approved source backup

Requires explicit **backup execution** approval, source identity acceptance and the
verified operator variables/files from the private checklist. The following is a
future operator template. It deliberately creates a unique new run directory,
refuses reuse and leaves incomplete files quarantined on error.

```powershell
$ErrorActionPreference = 'Stop'
$proviaDumpExe = 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe'
$proviaRestoreExe = 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe'
$proviaPsqlExe = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
# Mandatory manual gates above are not inferred from these variables being set.
if (-not $proviaPrivateDir -or -not $env:PGSERVICEFILE -or -not $env:PGPASSFILE) { throw 'Verified private operator setup required' }
$proviaRun = Join-Path $proviaPrivateDir ('provia-before-0007-' + [guid]::NewGuid().ToString('N'))
# No -Force: never reuse/overwrite an existing run directory.
$null = New-Item -ItemType Directory -Path $proviaRun -ErrorAction Stop
# Verify this new directory inherited the accepted ACL/encryption before continuing.
$proviaPartial = Join-Path $proviaRun 'application.dump.partial'
$proviaArchive = Join-Path $proviaRun 'application.dump'
if ((Test-Path -LiteralPath $proviaPartial) -or (Test-Path -LiteralPath $proviaArchive)) { throw 'Archive collision' }
& $proviaDumpExe --dbname='service=provia-approved-dev' --no-password --format=custom --no-owner --no-acl --lock-wait-timeout=30s --file=$proviaPartial 2> (Join-Path $proviaRun 'dump.stderr.private.txt')
if ($LASTEXITCODE -ne 0) { throw 'Backup failed. Retain private partial/log for review; never restore it' }
if ((Get-Item -LiteralPath $proviaPartial -ErrorAction Stop).Length -eq 0) { throw 'Empty archive' }
& $proviaRestoreExe --list $proviaPartial > (Join-Path $proviaRun 'archive-toc.private.txt') 2> (Join-Path $proviaRun 'list.stderr.private.txt')
if ($LASTEXITCODE -ne 0) { throw 'Archive unreadable; stop' }
# Privately review TOC includes expected schemas, tables/data, sequences and revision;
# inspect source DDL/extension requirements. Listing alone does not test restoration.
Move-Item -LiteralPath $proviaPartial -Destination $proviaArchive -ErrorAction Stop
$proviaDigest = Get-FileHash -LiteralPath $proviaArchive -Algorithm SHA256 -ErrorAction Stop
$proviaDigest.Hash | Set-Content -LiteralPath (Join-Path $proviaRun 'application.sha256.private.txt') -Encoding ascii -NoNewline
```

The move is a single file within the independently verified private run directory;
no recursive movement/deletion is proposed. A unique directory plus private ACL and
exclusive operator use prevents accidental reuse; stop on junctions, unexpected
files or another process using it. Keep complete/partial files and error logs private;
they may contain identities. Do not automatically delete partials or retry over them.
Label failed runs unusable and review retention/secure disposal separately. No passwords
are in commands; `--no-password` prevents interactive credential leakage to scripts.
Do not use verbose console output. No ownership/ACL restore is implied by archive creation.

## 3. Separately approved restore into verified empty target

Requires a completed approved backup, matching retained SHA256, inspected TOC/DDL,
compatible extensions/privileges and explicit **restore execution** approval for the
specific independently approved empty disposable target. Creating that database is
a separate approval; no creation command is silently embedded here.

Immediately recheck source/destination identities privately, destination emptiness
across non-system schemas and absence of other writers. No `--clean`, `--create`,
database reset, truncation or schema-drop fallback is allowed.

```powershell
$proviaExpectedHash = (Get-Content -LiteralPath (Join-Path $proviaRun 'application.sha256.private.txt') -Raw).Trim()
if ((Get-FileHash -LiteralPath $proviaArchive -Algorithm SHA256).Hash -ne $proviaExpectedHash) { throw 'Integrity mismatch' }
# STOP here unless identity/emptiness/privilege checks and restore approval are recorded.
& $proviaRestoreExe --dbname='service=provia-restore-test' --no-password --single-transaction --exit-on-error --no-owner --no-acl $proviaArchive 2> (Join-Path $proviaRun 'restore.stderr.private.txt')
if ($LASTEXITCODE -ne 0) { throw 'Restore failed. Preserve discrepancy/log evidence; no reset/retry fallback' }
& $proviaPsqlExe --dbname='service=provia-restore-test' --no-password --no-psqlrc --set=ON_ERROR_STOP=1 --tuples-only --no-align --output=(Join-Path $proviaRun 'restored-revision.private.txt') --command='SELECT version_num FROM public.alembic_version;' 2> (Join-Path $proviaRun 'revision.stderr.private.txt')
if ($LASTEXITCODE -ne 0) { throw 'Restored revision check failed' }
```

Require restored0004 before any rehearsal. Restore role owns created objects;
no role/password/global-object restoration is performed. Review expected ownership,
extension versions and application privilege needs separately; do not apply grants
without approval. Single transaction provides all-or-nothing restore where supported;
check extension compatibility/resources before executing, with no parallel restore.

Privately compare full schema/sequence state and source snapshot inventory, exact
stable UUIDs, selected historical content and ownership relationships, null/decimal
and timestamp values, validated constraints and orphan absence. Reconcile every
discrepancy, retaining evidence. Matching counts or readable TOC alone do not pass.
Do not manually mark restored users verified, send restored pending mail or start a
worker against the restore target. Keep restored credentials/data access restricted.

## 4. Restore acceptance then migration approval

Record backup timestamp/hash, comparison-window policy, target identity evidence,
restore logs/exit codes and private content checks. Obtain explicit restore acceptance.
If rehearsal migrations are desired, obtain separate write approval for that exact
disposable target; Phase7B neither creates it nor rehearses writes. Preserve existing
successful owned-disposable tests as supporting, not live restore, evidence.

For application migration, independently reverify intended direct0004 target, fresh
accepted backup and paused/coordinated application writes. Resolve Windows Application
Control for the existing Alembic launcher through administrator review first. Do not
switch launchers/entry points to evade the observed4551. Then obtain explicit
**application migration** approval for the0005→0006→0007 sequence:

```powershell
Set-Location 'D:\Dhyan\Self Projects\Provia\services\api'
python -m uv run --no-sync alembic current
if ($LASTEXITCODE -ne 0) { throw 'Expected approved target at0004; stop' }
# Operator must verify the printed revision/target, not merely exit0.
python -m uv run --no-sync alembic upgrade 0005
if ($LASTEXITCODE -ne 0) { throw '0005 failed; stop' }
python -m uv run --no-sync alembic current
if ($LASTEXITCODE -ne 0) { throw 'Verify0005; stop' }
# Verify five auth tables, indexes, validated FKs and preserved legacy inventory.
python -m uv run --no-sync alembic upgrade 0006
if ($LASTEXITCODE -ne 0) { throw '0006 failed; stop' }
python -m uv run --no-sync alembic current
if ($LASTEXITCODE -ne 0) { throw 'Verify0006; stop' }
# Verify encrypted outbox schema; leave email intake/worker activation gated.
python -m uv run --no-sync alembic upgrade 0007
if ($LASTEXITCODE -ne 0) { throw '0007 failed; stop' }
python -m uv run --no-sync alembic current
if ($LASTEXITCODE -ne 0) { throw 'Verify0007; stop' }
python -m uv run --no-sync alembic check
if ($LASTEXITCODE -ne 0) { throw 'Final metadata drift; stop deployment' }
python -m uv run --no-sync python -m scripts.verify_auth_readiness
if ($LASTEXITCODE -ne 0) { throw 'Review remaining readiness gates' }
```

At each step inspect actual revision and object/constraint/content checks.0007 must
preserve existing weights as manual/null source identity and introduce receipts.
Do not execute `alembic check` against intermediate revisions/current0007 models.
Mail readiness may still be blocked by deliberately disabled/unconfigured delivery;
do not weaken it to obtain a pass. No ordinary uv sync is permitted in this environment.
Never downgrade populated auth/outbox/receipts or automatically overwrite live data
from the backup after new writes. Forward repair and any live recovery need review.
Backend deployment/publication remains a separately authorized final step.

## References and validation boundary

Reviewed against [PostgreSQL18 pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html),
[pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html) and
[Neon logical backups](https://neon.com/docs/manage/backup-pg-dump).
Templates were source-reviewed only, not connected/executed. No claim of backup,
restore, privilege validation or successful migration is made by their presence.
