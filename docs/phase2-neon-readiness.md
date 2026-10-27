# Phase 2 — Neon database and migration readiness

Review date: 27 October 2026. Reviewed revision: `0005`, parent `0004`.
This document is preparation, not approval to mutate the existing application DB.
Only generated disposable test databases/schemas were migrated for this review.
The coordinating agent records the actual current application revision separately.

## Review outcome

No verified schema defect was found requiring a model or migration change. Revision
0005 creates only the five expected authentication tables and their indexes. It
contains no existing-table alteration, legacy enrollment, user duplication, data
rewrite or fitness-table deletion. Its downgrade drops authentication tables in
dependency order; it does not delete stable application users or fitness tables.
The application and Render build contain no automatic migration call.

| Table | Identity, relationships and lookup support |
| --- | --- |
| `auth_accounts` | UUID PK; unique normalized email; unique UUID `user_id` FK to `users.id`, `ON DELETE RESTRICT`; required name/hash/status; optional verification/login timestamps |
| `auth_sessions` | UUID PK; account FK `CASCADE`; account index; required expiry and last-used time; optional revocation/device label |
| `auth_refresh_tokens` | UUID PK; session FK `CASCADE`; session index and unique digest index; optional consumed time |
| `auth_actions` | UUID PK; account FK `CASCADE`; account index and unique digest index; allowed-purpose check; optional consumed time |
| `auth_rate_limits` | HMAC bucket PK; required attempts/expiry; expiry index for cleanup |

Account statuses and action purposes are constrained in PostgreSQL. Native UUID
columns preserve relationships to the original user UUIDs. Email normalization is
an application-boundary rule; direct operator enrollment must use that same rule.
Passwords use Argon2id and refresh/action values stored in PostgreSQL are digests,
not raw bearer credentials. The verified service paths perform account→family→token
locking and commit replay revocation/abuse counters before intentional errors.

Primary-key and unique indexes support token/account lookup, while the FK indexes
support account/session scoping and cascade operations. The present account index
supports the bounded session-list query, but its creation-time sort may warrant a
composite index after real account-history measurements. There is no evidence here
justifying speculative indexes or an additional migration. Session/action retention
and rate-limit cleanup load still need operational monitoring on the free database.

## Added regression coverage

`tests/integration/test_postgres.py` now checks:

- `0004 → 0005 → 0004 → 0005` with the same legacy application UUID and measured
  weight row retained, no automatic auth-account enrollment, and no metadata drift.
- Duplicate normalized auth email and duplicate stable-user links are rejected.
- Orphan accounts, session families, refresh tokens and actions are rejected.
- Duplicate token digests and unsupported action purposes are rejected.
- Deleting a stable user with an auth link is restricted and preserves fitness rows.
- Explicit auth-account deletion cascades only its auth children, retaining the
  application UUID and weight row. No public account-deletion endpoint was added.

The targeted run also includes existing real PostgreSQL registration/verification/
login persistence, refresh/replay revocation and cross-account session-denial tests.
These use test-only in-memory email delivery. No real verification email was sent.
Targeted result: **6 passed, 0 failures/errors/skips in 153.62 seconds** on real
PostgreSQL. The runner exited0 and removed only its generated disposable database.
JUnit: `services/api/.pytest_cache/phase2-db-readiness.xml` (ignored local artifact).
Ruff lint and formatting passed for the changed test file. The coordinating agent
will run the final integrated suite after all workstreams finish.

Executed from `services/api` using `python -m uv run --no-sync python -m
scripts.run_postgres_tests` with the following selected tests:

```text
tests/integration/test_postgres.py::test_migration_roundtrip_and_no_drift
tests/integration/test_postgres.py::test_auth_upgrade_preserves_legacy_identity_and_fitness_records
tests/integration/test_postgres.py::test_auth_schema_uniqueness_foreign_keys_and_deletion_boundaries
tests/integration/test_first_party_auth.py::test_registration_verification_login_and_secret_storage
tests/integration/test_first_party_auth.py::test_refresh_rotation_replay_commits_family_revocation
tests/integration/test_first_party_auth.py::test_sessions_logout_all_disabled_and_cross_account_revocation
```

## Operator backup before any approved application migration

Use an already approved PostgreSQL client, compatible with the server's major
version. If one is unavailable under Windows Application Control, obtain authorized
installation/approval; do not fetch alternate executables to evade policy. Review
[Neon's logical-backup guidance](https://neon.com/docs/manage/backup-pg-dump): use
the **direct**, not pooled, endpoint for dump/restore and Alembic.

Keep backup files and connection files outside this repository, outside cloud-sync
folders, and on an access-restricted encrypted volume. A dump contains personal
fitness data and, after enrollment, password hashes and session/action digests.
Do not attach it to chat, Git, build archives or logs. `pg_dump` was not found on
the current PATH; no client installation or real backup/restore was attempted.

Configure an operator-private libpq service file and password file locally, following
[PostgreSQL service-file](https://www.postgresql.org/docs/current/libpq-pgservice.html)
and [password-file](https://www.postgresql.org/docs/current/libpq-pgpass.html) formats.
The service section must be named `provia-approved-dev`, use the approved direct
host/database/user, and preserve the approved TLS settings (`sslmode=require` or
stronger; prefer certificate verification when provisioned). Put the matching
password only in the private password file, with correct escaping and restrictive
Windows ACLs. Do not place a credential URL/password on the command line.

The following is an operator template. Replace the two private paths locally;
these files and backup destinations were **not** created during this review:

```powershell
$proviaPrivateDir = Read-Host 'Existing encrypted private backup/config directory'
$proviaPrivateDir = (Resolve-Path -LiteralPath $proviaPrivateDir -ErrorAction Stop).Path
$proviaRepository = 'D:\Dhyan\Self Projects\Provia'
if ($proviaPrivateDir.TrimEnd('\').StartsWith($proviaRepository, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Choose a private backup directory outside the repository.'
}
$env:PGSERVICEFILE = Join-Path $proviaPrivateDir 'pg_service.conf'
$env:PGPASSFILE = Join-Path $proviaPrivateDir 'pgpass.conf'
$proviaBackupPath = Join-Path $proviaPrivateDir ('provia-before-0005-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump')
pg_dump --version
pg_dump --dbname='service=provia-approved-dev' --format=custom --no-owner --no-acl --file=$proviaBackupPath
if ($LASTEXITCODE -ne 0) { throw 'Backup failed. Do not migrate.' }
pg_restore --list $proviaBackupPath | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Backup archive could not be read. Do not migrate.' }
Get-FileHash -Algorithm SHA256 -LiteralPath $proviaBackupPath
```

Record the archive hash privately. Successful listing confirms the archive can be
read, **not** that restoration works. Restore the backup into a separately approved
empty disposable database and check expected IDs/relationships before the cutover.
Never use a restore target that names the existing application database. The dump
does not constitute a backup of external provider accounts or mobile SecureStore.
Do not assume Neon restore history/retention or extra branch resources are free or
available; verify the actual account allowances without enabling paid resources.

For the separately approved restore test, configure a second private libpq service
named `provia-restore-test`. An operator must independently verify its direct host,
database and role identify an **empty disposable target**, distinct from the
application database; a different service name alone is not proof. Then use the
[PostgreSQL restore options](https://www.postgresql.org/docs/current/app-pgrestore.html):

```powershell
# Requires the private PGSERVICEFILE/PGPASSFILE and archive path from above.
# Approval and target verification are mandatory before this write operation.
pg_restore --dbname='service=provia-restore-test' --single-transaction --exit-on-error --no-owner --no-acl $proviaBackupPath
if ($LASTEXITCODE -ne 0) { throw 'Disposable restore failed. Do not migrate.' }
psql --dbname='service=provia-restore-test' --no-psqlrc --set=ON_ERROR_STOP=1 --command='SELECT version_num FROM public.alembic_version;'
if ($LASTEXITCODE -ne 0) { throw 'Restored revision check failed. Do not migrate.' }
```

Do not add `--create` (which can select the database named in the archive) or
`--clean`. This template has not been executed. Privately compare the restored
stable UUIDs, fitness counts and sampled historical snapshots with the backup
inventory; retain that evidence before authorizing the application migration.

## Exact approved migration and post-migration checks

These steps are a handoff, not executed approval. Stop application writes during the
snapshot/comparison window so legitimate fitness writes do not invalidate comparisons.
Confirm `.env` privately references the intended development database, with its direct
URL in `DIRECT_DATABASE_URL`; Render runtime should retain the pooled `DATABASE_URL`.

```powershell
Set-Location 'D:\Dhyan\Self Projects\Provia\services\api'
python -m uv run --no-sync alembic current
if ($LASTEXITCODE -ne 0) { throw 'Unable to confirm current revision.' }
# Require the intended database at revision 0004, a verified backup, and explicit approval.
# DO NOT run the next command merely because it is documented here.
python -m uv run --no-sync alembic upgrade 0005
if ($LASTEXITCODE -ne 0) { throw 'Migration failed. Keep the old release and investigate.' }
python -m uv run --no-sync alembic current
if ($LASTEXITCODE -ne 0) { throw 'Post-migration revision check failed.' }
python -m uv run --no-sync alembic check
if ($LASTEXITCODE -ne 0) { throw 'Metadata drift detected. Do not deploy.' }
```

Expected revision after the approved upgrade is 0005 and no metadata drift. The
upgrade does not create accounts or sessions automatically. Existing-row counts,
sample stable user/fitness IDs and canonical historical goal/meal snapshots should
match the private pre-migration inventory; counts alone do not prove content equality.
Check FK validation and all five new tables. New auth tables should be empty before
controlled enrollment. Perform a controlled first-party registration/email/login/
refresh/logout exercise only after the separately approved backend/email cutover.
Do not treat `/health/db` success as proof that the auth schema or delivery works.

Read-only SQL checks may use the private libpq service, without exposing settings:

```powershell
psql --dbname='service=provia-approved-dev' --no-psqlrc --set=ON_ERROR_STOP=1 --command='SELECT version_num FROM public.alembic_version;'
if ($LASTEXITCODE -ne 0) { throw 'Revision query failed.' }
psql --dbname='service=provia-approved-dev' --no-psqlrc --set=ON_ERROR_STOP=1 --command="SELECT count(*) AS expected_auth_tables FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('auth_accounts','auth_sessions','auth_refresh_tokens','auth_actions','auth_rate_limits');"
if ($LASTEXITCODE -ne 0) { throw 'Schema query failed.' }
psql --dbname='service=provia-approved-dev' --no-psqlrc --set=ON_ERROR_STOP=1 --command="SELECT count(*) AS unvalidated_foreign_keys FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace AND NOT convalidated;"
if ($LASTEXITCODE -ne 0) { throw 'Constraint query failed.' }
```

Expect five auth tables and no newly unvalidated foreign keys. If a pre-existing
schema already has unvalidated constraints, investigate against its baseline rather
than misattributing them to0005. Never print account emails, hashes, action digests,
refresh values or fitness rows into the migration report. Confirm the private libpq
service and the application's direct URL refer to the same approved database before
using the two tools; their names alone do not establish that relationship.

## Existing users and rollback

Legacy fitness records remain owned by the same `users.id`. Old provider subjects
are retained; contact email alone cannot enroll or merge an account. New independent
accounts are safe when registration passes existing collision/uniqueness checks,
but they do **not** gain access to a legacy user's records. Registration matching an
unclaimed legacy contact remains generic and blocked from taking that record.

Safe legacy enrollment requires separately proven old-provider subject ownership,
proof of the new email, a controlled one-time password-setting ceremony, unique
account/user-link checks and an audited transaction linking the existing UUID. An
operator must review ambiguous/duplicate contact addresses. This flow is not yet
implemented and must not be simulated by raw SQL setting `email_verified_at`, an
email-only password reset, or an unprotected admin claim endpoint. Keep legacy users
on the old release or defer broad cutover until this enrollment process is approved.

For an application rollback, stop new auth writes and revert the compatible backend
and APK pair together. Keep 0005 tables and preserved old live provider credentials;
the older backend ignores the additive auth tables. Do not downgrade a populated
application database: downgrade drops first-party credentials/session history and
breaks first-party users even though fitness rows survive. New first-party accounts
do not become old-provider accounts automatically. Prefer a forward repair.

Disposable test-only downgrade syntax is
`python -m uv run --no-sync alembic downgrade 0004`, followed by
`python -m uv run --no-sync alembic upgrade 0005` and `alembic check` on that disposable
target. Do not copy those commands against the normal `.env` database. Restore a
backup into the live database only as a separately approved recovery procedure,
accounting for all writes since the snapshot; never overwrite newer fitness data
merely to undo this additive schema change.
