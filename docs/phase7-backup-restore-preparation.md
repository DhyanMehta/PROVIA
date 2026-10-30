# Phase7 backup/restore preparation

30 October2026, Asia/Calcutta. User explicitly approved backup/restore **preparation**.
Actual application backup, restore, migration, deployment, mail activation and EAS
build remain separately gated. No database contents were copied or changed.

## Verified prerequisites

- Existing installed tools at `C:\Program Files\PostgreSQL\18\bin\pg_dump.exe`,
  `pg_restore.exe`, `psql.exe` all successfully returned PostgreSQL18.4 with `--version`.
  No PATH change or new executable installation needed. Metadata reports NotSigned;
  the observed version executions succeeded, with no policy bypass.
- Read-only existing direct connection: server major18, application revision0004.
  Client18 matches server18. No endpoint, database name, role or password was printed.
- `PGSERVICEFILE` and `PGPASSFILE` are not configured in the inspected process.
- No operator-selected encrypted, access-restricted directory has been verified.
  Do not assume a normal folder or a folder name establishes encryption/ACLs.
- No independently approved empty restore database has been selected or created.
- Local direct-target identity still must be compared privately with Render's actual
  database before treating it as the intended deployment database.

## Operator preparation needed

Select an existing encrypted private directory outside Git and cloud-sync folders.
Privately verify encryption and ACLs permit only the intended operator/administrators;
do not enable encryption or alter system security speculatively. Do not paste its
connection files or database URLs into chat. Configure libpq files under that directory:

`pg_service.conf` template (placeholders only):

```ini
[provia-approved-dev]
host=<verified-direct-host>
port=5432
dbname=<verified-application-database>
user=<approved-role>
sslmode=require

[provia-restore-test]
host=<independently-verified-direct-host>
port=5432
dbname=<approved-empty-disposable-database>
user=<approved-restore-role>
sslmode=require
```

Preserve stronger existing TLS verification. In private `pgpass.conf`, add exact
`host:port:database:user:password` entries, escaping colon/backslash per libpq rules.
Never use broad wildcard entries or print the contents. A different service name
does not establish a distinct empty restore target. Do not invent an existing target.

After the directory/files are verified privately, set these only in the operator's
session (replace the placeholder path locally):

```powershell
$proviaPrivateDir = (Resolve-Path -LiteralPath '<verified-private-directory>').Path
$env:PGSERVICEFILE = Join-Path $proviaPrivateDir 'pg_service.conf'
$env:PGPASSFILE = Join-Path $proviaPrivateDir 'pgpass.conf'
$proviaPgBin = 'C:\Program Files\PostgreSQL\18\bin'
```

Before approval to execute backup/restore, review `phase3-deployment-runbook.md`
backup procedure with these installed absolute tool paths. Its dump/list/hash and
single-transaction restore commands remain templates, not actions performed here.
Do not use `--clean` or `--create`; restore only to the verified empty disposable
target. Keep hashes/inventories private. Compare stable UUIDs and historical goal/
meal content, not merely row counts. Pause/coordinate application writes during
the comparison window. Backup listing alone does not establish a successful restore.

Following actual backup/restore acceptance and **separate** migration approval, use
the Phase6 release instructions for0005→0006→0007. Do not use the older Phase2
intermediate0005 metadata-drift check against current0007 models.

Preparation status: tools/version compatibility PASS; private storage/connection-file
and distinct restore-target verification PENDING. Backup NOT RUN; restore NOT RUN;
application migration NOT RUN.
