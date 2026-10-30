# Phase7C operator decision

30 October2026, Asia/Calcutta. Focused read-only follow-up to Phase7B. No blocked
launcher retry, database operation, security change or credential export performed.

## Correlated Application Control evidence

Approved read access to `Microsoft-Windows-CodeIntegrity/Operational` succeeded
after sandbox access denial. Initial time-filter query found no events; a bounded
retained-log scan found the exact launcher hash. One scan's PowerShell counter
collision was corrected before the successful result. Log enabled,1220 records
retained from25September through30October; no log clearing/export occurred.

- Event3077, record6481, UTC2026-10-30T13:38:34.3605647Z =19:08:34IST.
- Event3033, record6479, UTC2026-10-30T13:38:34.3602557Z.
- Denied file: existing `services/api/.venv/Scripts/alembic.exe`; caller `uv.exe`.
- Event SHA256 Flat Hash matches the previously recorded file SHA256 exactly:
  `5C689FDF6F746892EE36FA6934AA35944B932A541CA7D9960A8CAC735D565975`.
- Policy `VerifiedAndReputableDesktop`, policy version/ID `27555.1000.240208`,
  policy GUID `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`.
- Status `0xc0e90002`, requested signing level2, validated level1.
- Read-only `VerifiedAndReputablePolicyState=1`; machine domain-joined=false.

The block is on the launcher itself; matching evidence does not identify a dependent
DLL as the cause. A signed parent process does not confer trust on the child.
The observed policy/state is consistent with Smart App Control enforcement.
Domain-joined=false does not exclude MDM or other management; administrator-managed
ownership is NOT ESTABLISHED by these limited probes. No broad security inventory
or private management identifiers were collected.

Authorized remediation: device administrator reviews these two records and the
exact launcher hash, confirms Smart App Control ownership/state in Windows Security,
and determines a supported trusted code-signing/reputation remediation for the
existing launcher with the responsible tooling publisher/security administrator.
Do not promise that adding a hash allow rule works for Smart App Control: Microsoft
states there is no individual-app bypass. No self-signing, replacement binary,
alternate entry point, disabling, registry editing or security-policy weakening is
authorized here. If no compliant remediation is available, keep execution blocked.
See [Microsoft FAQ](https://support.microsoft.com/en-gb/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions)
and [Smart App Control overview](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/overview).

## Operator decision table

| Blocker | Evidence | Exact next action | Manual? | Approval? | Safe to proceed? |
| --- | --- | --- | --- | --- | --- |
| Application Control |3077/3033/hash correlation above |Administrator reviews exact event/file and supported trust remediation; preserve enforcement |Yes, administrator |Required for any remediation/action beyond read-only review |No migration-tool execution |
| Secure backup storage |No operator path supplied; previous encryption probe unavailable; libpq environment paths still unset |Select existing encrypted nonsynced private folder; privately verify BitLocker/EFS recovery custody and effective ACLs incl inherited groups/share access |Yes; agent can inspect supplied path read-only |Read-only verification already authorized; creating/encrypting/changing ACLs needs approval |No backup/credential writes |
| Application DB identity |No authenticated Render/Neon configuration connection exposed to this task |In private dashboards compare Render DATABASE_URL to Neon project/branch/endpoint/database and local DIRECT_DATABASE_URL; map pooled/direct using Neon endpoint metadata; report match/mismatch only |Yes unless authorized dashboard access supplied |Read-only comparison authorized; no secret transmission to chat |No backup approval yet |
| Empty restore DB |No separately approved target supplied; no restore connection configured |Select candidate and verify distinct identity/empty non-system schemas/role privileges; if absent request approval for specific target only after quota check |Yes unless authorized account access supplied |Creation needs explicit approval; read-only verification authorized |No restore |
| Account free capacity |No authenticated Neon plan/usage/quota evidence accessible |Owner checks actual free plan, branch/database/compute/storage allowances and current consumption before selecting any Neon resource |Yes |No upgrade/payment authorized |No resource-creation recommendation yet |

No private directory was selected on the operator's behalf. Existing Windows
PostgreSQL service `postgresql-x64-18` is running; that alone does not establish
credentials, an empty database or restore permissions.

## Restore options for operator selection — no creation recommendation yet

| Candidate | Isolation / feasibility | Required evidence before proposal approval |
| --- | --- | --- |
| Separate database on existing local PostgreSQL18 |Distinct DB with no production-data branch clone; no Neon resource allocation. Existing service running, credentials/privileges not supplied |Local encryption/ACLs, role/extension compatibility, free disk and explicit creation approval; not yet an approved target |
| New empty database on existing Neon branch |Separate database, shares branch compute/roles and quotas; weaker infrastructure isolation |Actual account allowances/usage, source distinction, CREATE privileges and cost-free capacity; no existing target established |
| Isolated Neon branch with explicitly empty database |Better branch isolation, but a normal production branch clone contains source data and is NOT an empty restore target |Actual free account branch/compute/storage capacity and supported empty-target workflow; no implicit production clone, cleanup or extra spend |

No authenticated account-specific quota evidence was available, so no new Neon
resource is recommended for execution. Generic public plan limits cannot substitute
for account-specific verification. Do not reuse old generated test databases or
infer emptiness from a name/branch label. No existing database contents were read.

## Decision

WINDOWS APPLICATION CONTROL: BLOCKED

SECURE BACKUP DIRECTORY: BLOCKED

APPLICATION DATABASE IDENTITY: BLOCKED

RESTORE DATABASE: NOT AVAILABLE

BACKUP EXECUTION: NOT STARTED

RESTORE EXECUTION: NOT STARTED

NEON MIGRATION: NOT STARTED

READY TO REQUEST BACKUP APPROVAL: NO

Immediate operator action: have the device administrator inspect Code Integrity
records6481/6479 and confirm a supported trust-remediation path without disabling
Smart App Control. In parallel, supply only the path of an existing encrypted private
directory; do not send its contents or credentials. Privately complete the dashboard
identity/quota comparison before requesting approval for a particular restore target.
