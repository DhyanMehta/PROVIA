# Phase 7B private operator checklist

30 October2026. Instructions only. Keep actual paths, identities, connection files,
ACL listings and application inventories in the approved private operator context.
Do not paste passwords, URLs, host/database/user names or private listings into chat.

## Select and verify storage

1. Select an **existing** private directory outside this repository, shared folders,
   OneDrive/Dropbox/Google Drive and other sync roots. Do not create an arbitrary
   repository folder or treat “private” in a name as proof. Check parent junctions,
   links and mount points so the resolved target stays on the intended volume.
2. In a private PowerShell session use the following read-only checks; inspect
   output locally only. They do not enable encryption or change ACLs:

```powershell
$proviaPrivateDir = (Resolve-Path -LiteralPath (Read-Host 'Existing private directory') -ErrorAction Stop).Path
$proviaDir = Get-Item -LiteralPath $proviaPrivateDir -ErrorAction Stop
if (-not $proviaDir.PSIsContainer) { throw 'Directory required' }
$proviaAncestor = $proviaDir
while ($null -ne $proviaAncestor) {
    if ($proviaAncestor.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Review link/mount ancestry before proceeding' }
    $proviaAncestor = $proviaAncestor.Parent
}
$proviaRepo = 'D:\Dhyan\Self Projects\Provia'
if ($proviaPrivateDir.TrimEnd('\') -eq $proviaRepo -or $proviaPrivateDir.StartsWith($proviaRepo + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Repository storage forbidden' }
Get-BitLockerVolume -MountPoint $proviaDir.PSDrive.Root -ErrorAction Stop
Get-Acl -LiteralPath $proviaPrivateDir | Format-List Owner,AccessToString,AreAccessRulesProtected
```

3. Confirm volume encryption completed and ProtectionStatus=On, with approved
   recovery-key custody. Unavailable/denied query means NOT VERIFIED; consult the
   operator/admin locally. If relying on EFS instead, verify actual folder/files'
   encryption using Windows Properties → Advanced or read-only `cipher /c`, and
   verify private EFS key/recovery custody. Do not assume folder attributes protect
   every pre-existing child. Do not enable BitLocker/EFS in this phase.
4. Review effective ACL access, including inherited/group entries and share
   permissions. Only the intended operator and necessary SYSTEM/administrators
   should read contents. Unrelated users, Everyone, Users or Authenticated Users
   must not gain unintended read through group membership/inheritance. An explicit
   allow list alone does not establish effective access. Administrator remediation
   requires approval; do not automatically reset ACLs. Confirm free space privately.

## Private connection files

Only after storage verification, use a trusted local editor to create UTF-8 files
`pg_service.conf` and `pgpass.conf` there. Never type actual credentials into shell
commands/history. Do not use transcript logging or sync-backed editors. Verify both
files inherit only the reviewed private ACL and storage protection.

```ini
# Template only — fill values privately from approved configuration
[provia-approved-dev]
host=<approved-direct-source-endpoint>
port=5432
dbname=<approved-source-database>
user=<approved-read-role>
sslmode=require
connect_timeout=10

[provia-restore-test]
host=<approved-direct-disposable-endpoint>
port=5432
dbname=<approved-empty-restore-database>
user=<approved-restore-role>
sslmode=require
connect_timeout=10
```

Preserve stronger approved TLS settings (verify-full/CA), channel binding and provider
options. Confirm Neon endpoint is direct, not pooler, in the actual console. On
`pgpass.conf` use exact `host:port:database:user:password` entries for each target;
escape `:` and `\` with `\`. Avoid wildcards. Never put password= in the service file.
On Windows libpq does not enforce Unix permission modes; private ACL review matters.
See [PostgreSQL18 password-file rules](https://www.postgresql.org/docs/18/libpq-pgpass.html).

Configure only the private operator process after inspection:

```powershell
$env:PGSERVICEFILE = Join-Path $proviaPrivateDir 'pg_service.conf'
$env:PGPASSFILE = Join-Path $proviaPrivateDir 'pgpass.conf'
if ($env:PGPASSWORD) { throw 'Remove unintended password override privately before proceeding' }
foreach ($proviaFile in @($env:PGSERVICEFILE,$env:PGPASSFILE)) {
    if (-not (Test-Path -LiteralPath $proviaFile -PathType Leaf)) { throw 'Private connection file missing' }
}
```

Privately compare resolved host/port/database/role and actual Neon endpoint identity
against Render's approved runtime configuration and the local direct configuration.
Different pooled/direct hosts may represent one database; different service names may
represent the same database. No independent Render access was available in Phase7B.

## Restore target and permissions

No approved restore target currently exists in this preparation record. Proposal for
later approval: operator chooses a new uniquely named disposable database on a
verified compatible PostgreSQL18 server within the existing free allowance, created
from template0 with compatible encoding/collation/locale and required extensions.
Do not execute creation or enable paid resources now; do not reuse old generated
databases. Review Neon role/extension limitations first.

After approval/existence, read-only inspection must privately establish:

- Source and destination are distinct actual database identities; names alone or OIDs
  across different clusters do not establish this. Compare provider endpoint/branch
  metadata plus database identity and approval record.
- Destination has no user tables/data, views, sequences, routines or other application
  objects in **any non-system schema**, no unrelated activity and no unexpected owners.
  Compare preinstalled extensions/default objects to approved template baseline;
  “public has no rows” alone is insufficient.
- Restore role can CONNECT/CREATE and create required schemas/objects/extensions;
  source role can read every required table/sequence without RLS omissions. Do not
  test privileges with trial writes or grant broad superuser access.
- Record server versions and TLS, transaction/log/statement timeout budgets. Inspect
  aggregate privileges/emptiness privately without dumping records to shared logs.

Record only gate statuses in repository documentation. Stop on ambiguous identity,
populated target, missing permissions or any policy block.
