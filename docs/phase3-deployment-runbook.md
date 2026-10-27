# Phase 3 controlled deployment runbook

Reviewed 27–28 October 2026. **Preparation only: none of the live operations below
was executed.** No real key was generated, sender configured, application database
migrated, branch pushed, Render service deployed, APK built or phone data cleared.
Use the coordinator's completion report for the final reviewed commit and tests.

## Infrastructure decision and limitations

The web process can supervise a worker and recover persisted PostgreSQL jobs after
a restart. This supports a controlled preview without a separate paid worker.
It does **not** provide reliable always-on delivery or a bounded production SLA.
[Render Free](https://render.com/docs/free) sleeps after 15 minutes without inbound
traffic, wakes on a later request, may restart, and can be suspended when its
workspace allowance is exhausted. No jobs run while that process is asleep or
suspended. No self-ping, external cron, public queue-drain endpoint or paid service
has been introduced. Native SMTP ports are blocked; use the HTTPS adapter.

The [Free compute plan](https://render.com/docs/compute-plans) has 0.1 CPU and 512 MB
RAM. Keep the current single service/process and bounded worker; measure memory,
CPU and backlog during controlled acceptance before any wider launch.

[Neon Free](https://neon.com/docs/introduction/plans) currently allows 100 CU-hours
per project per month, 1 GB storage and 5 GB public egress, with automatic suspension
after five idle minutes. Polling every two seconds prevents that idle suspension
while the web process is awake. For scale, 0.25 CU running 720 hours consumes about
180 CU-hours, above the included compute allowance. Check the actual account quota
and usage; do not enable overages, add resources or assert sustained free operation.

## Queued behavior and operational evidence

All eligible and unknown addresses take the public enqueue path. A generic 202
means the request transaction was accepted, not that an account exists, a message
was sent or delivery succeeded. Registration/account eligibility is deferred to
the worker. These enqueue responses never include action tokens or per-address status.

The worker has one bounded attempt at a time, PostgreSQL row claims with
`SKIP LOCKED`, a 120-second claim lease and a fencing UUID. It commits preparation
before provider I/O. Four attempts at most are scheduled with 60/300/600-second
retry intervals, bounded by the original intent deadline: 30 minutes for registration
or verification, 15 minutes for reset. Receipt may leave much less usable link time.
Terminal states scrub encrypted payloads. The worker removes at most 100 terminal
metadata rows older than seven days per poll; sleeping services defer that cleanup.
Forced host termination can interrupt a send; the next process reclaims the job
after its lease expires, with provider idempotency handling an uncertain acceptance.

Fernet/MultiFernet encrypts the recipient, registration password hash and recoverable
link material; envelopes bind the job UUID and purpose. Action tables retain hashes.
Pending registration uses first-request-wins and cannot overwrite an existing
password or claim a legacy identity. Provider acceptance remains distinct from inbox
receipt. Already-sent messages cannot be recalled when later requests invalidate links.

[Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys)
retains keys for 24 hours. Jobs use a stable UUID-derived key and the same link on
retry; their deadlines are shorter than that window. Keep sender and templates
stable while active jobs drain. Changing them can cause a provider payload-mismatch
rejection; do not change the key to force a duplicate send. Generic SMTP has no
equivalent exactly-once guarantee. No provider offers inbox delivery proof from 202.

After approval, use the read-only local operator tools:

```powershell
Set-Location 'D:\Dhyan\Self Projects\Provia\services\api'
python -m uv run --no-sync python -m scripts.verify_auth_readiness
python -m uv run --no-sync python -m scripts.auth_email_status
```

They load local Settings/environment and the configured database. They do not inspect
Render's live variables, prove a remote worker heartbeat or prove inbox delivery.
Keep status output aggregate-only; never select or print ciphertext, recipients,
password hashes, action values or health records. Local readiness may remain BLOCKED
when local operator settings intentionally differ from Render. Do not copy server
secrets locally merely to make it green.

Watch queue states (`queued`, `processing`, `retry`, `sent`, `cancelled`, `expired`,
`failed`), repeated safe worker-error categories, provider rejection/quota and real
controlled inbox receipt. A rising backlog, repeated expirations or no observed
progress while the service is awake requires investigation. `sent` means provider
acceptance, not inbox receipt. Free-tier dashboards and manual checks are not an
always-on monitoring service. Persistent auth/session-table retention remains a
separate operational concern.

## 1. Private configuration and key custody — approval required

Preserve existing valid signing secrets unless a new deployment key or rotation is
specifically approved. Use a separate server-only Fernet key ring. Never place
these values in `EXPO_PUBLIC_*`, chat, Git, shell arguments or logs.

The following optional operator script generates secrets **only when the operator
runs it after approval**. Choose an existing encrypted, restricted directory outside
the repository and cloud-sync folders. Confirm its Windows ACLs first. It creates
a new file, refuses overwrite and prints no key values. A new signer is optional;
do not inadvertently rotate an existing one.

```powershell
$proviaPrivateDir = (Resolve-Path -LiteralPath (Read-Host 'Existing private encrypted directory') -ErrorAction Stop).Path
$proviaCheckDir = Get-Item -LiteralPath $proviaPrivateDir -ErrorAction Stop
while ($null -ne $proviaCheckDir) {
    if (($proviaCheckDir.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Choose a physical directory without junction/symlink ancestors.' }
    $proviaCheckDir = $proviaCheckDir.Parent
}
$proviaRepo = 'D:\Dhyan\Self Projects\Provia'
if ($proviaPrivateDir.TrimEnd('\') -eq $proviaRepo -or $proviaPrivateDir.StartsWith($proviaRepo + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Choose a private directory outside the repository.' }
$proviaSecretPath = Join-Path $proviaPrivateDir '.env.provia-auth-private'
$proviaRng = [Security.Cryptography.RandomNumberGenerator]::Create()
$proviaStream = $null
try {
    $proviaKeyBytes = New-Object byte[] 32
    $proviaRng.GetBytes($proviaKeyBytes)
    $proviaKey = [Convert]::ToBase64String($proviaKeyBytes).Replace('+','-').Replace('/','_')
    $proviaLines = @('AUTH_EMAIL_ENCRYPTION_KEYS=' + (ConvertTo-Json -InputObject @($proviaKey) -Compress))
    if ((Read-Host 'Generate a specifically approved NEW JWT signer too? Type YES') -ceq 'YES') {
        $proviaSignerBytes = New-Object byte[] 48
        $proviaRng.GetBytes($proviaSignerBytes)
        $proviaLines += 'AUTH_JWT_SECRET=' + [Convert]::ToBase64String($proviaSignerBytes).Replace('+','-').Replace('/','_').TrimEnd('=')
    }
    $proviaStream = [IO.File]::Open($proviaSecretPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
    $proviaWriter = New-Object IO.StreamWriter -ArgumentList $proviaStream
    try { foreach ($proviaLine in $proviaLines) { $proviaWriter.WriteLine($proviaLine) } } finally { $proviaWriter.Dispose() }
} finally {
    if ($null -ne $proviaStream) { $proviaStream.Dispose() }
    $proviaRng.Dispose()
}
Write-Host 'New private secret file created. Transfer values only through the approved secret manager.'
```

Treat that file as credentials, not a build artifact. Do not print it to a shared
terminal or attach it here. The JSON key ring accepts one to three unique Fernet
keys, newest first. Retain previous keys until all dependent jobs have drained or
expired and your approved backup-recovery window is accounted for. Losing every
applicable key makes pending payloads unrecoverable; users must request fresh
registration/recovery under a valid key. Never bypass email verification.

JWT rotation changes access signatures and the HMAC keys used by rate limits and
intent deduplication. Online rotation with pending registrations is unsupported:
pause enqueue with `AUTH_EMAIL_REQUESTS_ENABLED=false`, keep the worker draining,
confirm zero active jobs, then stop it, rotate the signer, restart and re-enable
requests only after checks. A signer change does not revoke opaque refresh families;
compromise response must separately address affected sessions. Do not rotate merely
to evade rate limits. Preserve old key custody and document rollback implications.

## 2. Resend Free setup — approval required

Use the owner's Free account and existing owned domain/subdomain. Current
[published limits](https://resend.com/pricing) are 3,000 messages/month and 100/day;
confirm the real account limits without enabling paid features. Add the exact SPF
and DKIM records from the [domain setup](https://resend.com/docs/dashboard/domains/introduction),
wait for Verified and preserve existing mail routing. Create a sending-scoped key
and restrict it to that domain where available. Disable open/link tracking for
credential emails. The provider's test domain allows only the account owner's
recipient; it is not public signup. Without an authorized sender, delivery stays
blocked. No sender, domain ownership, permission or successful email is invented here.

## 3. Backup/restore and migrations — separate approval required

Use the full private libpq-file and backup custody procedure in
[the Neon runbook](phase2-neon-readiness.md). `pg_dump`, `pg_restore` and `psql` were
not found on PATH in this review. Obtain an authorized compatible client if needed;
do not fetch binaries to evade Windows Application Control. Backups and connection
files must remain on an encrypted restricted volume outside Git/cloud sync.

After the operator verifies the approved direct target and write-free comparison
window, configure private `PGSERVICEFILE`/`PGPASSFILE` entries named
`provia-approved-dev` and an independently verified empty `provia-restore-test`.
The second service name alone does not establish a safe distinct target.

```powershell
$env:PGSERVICEFILE = Join-Path $proviaPrivateDir 'pg_service.conf'
$env:PGPASSFILE = Join-Path $proviaPrivateDir 'pgpass.conf'
$proviaDump = Join-Path $proviaPrivateDir ('provia-before-0006-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump')
pg_dump --dbname='service=provia-approved-dev' --format=custom --no-owner --no-acl --file=$proviaDump
if ($LASTEXITCODE -ne 0) { throw 'Backup failed; do not migrate.' }
pg_restore --list $proviaDump | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unreadable archive; do not migrate.' }
Get-FileHash -Algorithm SHA256 -LiteralPath $proviaDump
# Next write is permitted only to the separately approved EMPTY disposable target:
pg_restore --dbname='service=provia-restore-test' --single-transaction --exit-on-error --no-owner --no-acl $proviaDump
if ($LASTEXITCODE -ne 0) { throw 'Restore test failed; do not migrate.' }
```

Privately verify restored UUIDs, fitness counts and sampled goal/meal snapshots;
archive listing and matching counts alone do not prove recovery. Do not use `--clean`
or `--create` to redirect this restore to a database named inside the archive.

Only after backup/restore acceptance and explicit application-migration approval:

```powershell
Set-Location 'D:\Dhyan\Self Projects\Provia\services\api'
python -m uv run --no-sync alembic current
if ($LASTEXITCODE -ne 0) { throw 'Revision check failed.' }
# Require the intended existing application at 0004; otherwise stop and review.
python -m uv run --no-sync alembic upgrade 0005
if ($LASTEXITCODE -ne 0) { throw '0005 failed; stop cutover.' }
python -m uv run --no-sync alembic current
if ($LASTEXITCODE -ne 0) { throw '0005 revision check failed.' }
python -m uv run --no-sync alembic upgrade 0006
if ($LASTEXITCODE -ne 0) { throw '0006 failed; stop cutover.' }
python -m uv run --no-sync alembic current
if ($LASTEXITCODE -ne 0) { throw '0006 revision check failed.' }
python -m uv run --no-sync alembic check
if ($LASTEXITCODE -ne 0) { throw 'Metadata drift; stop cutover.' }
```

Expect 0006, six auth tables, validated FKs and preserved private pre/post UUID and
fitness inventories. New auth/outbox tables do not automatically enroll legacy
users. Do not run metadata `alembic check` at intermediate 0005 against the newer
0006 models and mistake the expected difference for failed migration. Startup and
Render build must not migrate. Two older generated-name databases need separate
ownership review before cleanup; never delete by prefix alone.

## 4. Render manual deployment — approval required

Keep the existing service identity and Free plan. Confirm actual auto-deploy is off
before approving publication/merge into the service's tracked `main` branch. The
local blueprint is not proof of its live setting. Publishing, merging, changing a
tracked branch, changing live variables and deploying each need explicit approval.

| Variable | Approved value/source | Secret? |
|---|---|---|
| `DATABASE_URL` | Existing approved pooled Neon TLS connection | Yes |
| `AUTH_JWT_SECRET` | Existing valid or specifically approved new signer | Yes |
| `AUTH_TOKEN_ISSUER` | `https://provia-mag7.onrender.com` | No |
| `AUTH_TOKEN_AUDIENCE` | `provia-mobile` | No |
| `AUTH_ACCESS_SECONDS` / `AUTH_REFRESH_DAYS` | `900` / `30` | No |
| `AUTH_TRUSTED_PROXY_CIDRS` | `[]` until immediate ingress networks are verified | No |
| `AUTH_EMAIL_PROVIDER` | `resend` | No |
| `AUTH_EMAIL_ENCRYPTION_KEYS` | Private ordered JSON key ring | Yes |
| `AUTH_EMAIL_REQUESTS_ENABLED` | `false` during preparation; `true` only for approved controlled acceptance/operation | No |
| `AUTH_EMAIL_WORKER_ENABLED` | `false` until schema/key/provider approval; then `true` for preview | No |
| `AUTH_EMAIL_POLL_SECONDS` | `2`, valid range 1–60; assess quota before changing | No |
| `RESEND_API_KEY` / `RESEND_FROM` | Actual sending key and verified permitted sender | Key secret; sender private config |
| `APP_ENV` / `DEBUG` / `LOG_LEVEL` | `staging` / `false` / `INFO` | No |
| `PYTHON_VERSION` / `CORS_ORIGINS` | `3.12.15` / existing approved origins (`[]` for native-only) | No |
| `USDA_API_KEY` / `OFF_USER_AGENT` | Preserve approved nutrition settings | Key secret |

Do not supply the direct URL to runtime or put any server secret in EAS public
variables. Do not weaken issuer/audience validation or trust every proxy; Render
outbound IPs do not identify ingress proxies. Unverified proxy configuration can
cause users to share the same peer rate-limit bucket.

Use the reviewed published commit, build command `bash scripts/render_build.sh`
and start command exactly:

```text
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port $PORT --no-access-log --no-proxy-headers
```

Render's Linux shell expands `$PORT`. The Linux locked install is not a Windows
environment-repair command; never run ordinary `uv sync` in the repaired project.

After approved deployment, verify schema/keys/provider configuration privately,
enable the worker for the controlled preview, then explicitly approve intake for
controlled email/API acceptance. Native-link acceptance follows the later APK build.
The paused-intake preflight is expected to show that gate as blocked. Expect missing/invalid bearer 401,
valid login/refresh 200, generic register/resend/recovery 202, maintenance enqueue 503,
pending/disabled fitness 403, malformed input 422 and throttling 429. A health/db 200
does not prove worker/schema/sender readiness. Run the read-only smoke:

```powershell
Set-Location 'D:\Dhyan\Self Projects\Provia'
node scripts/check-sprint-backend.mjs https://provia-mag7.onrender.com/api/v1
```

Use safe HTTP category/status/request IDs for diagnosis. Do not share bodies,
passwords, JWTs, action URLs or recipient/fitness records. Inspect real inbox receipt
and provider acceptance separately; test restart/lease recovery only with explicit
live restart approval and controlled accounts. Do not keep the free service awake
through unapproved traffic automation.

## 5. Expo preview and Samsung A35 — build approval required

Set only `EXPO_PUBLIC_API_URL=https://provia-mag7.onrender.com/api/v1` in the approved
preview environment. Preserve owner `dhyan_mehta`, project
`4e131be3-7394-4883-ae44-498c63bfcac5`, package `com.provia.app`, scheme `provia`,
preview internal standalone APK profile and existing signing credentials.
No Clerk key or server key belongs in the app.

After backend/provider acceptance, dependency-risk review and explicit build approval:

```powershell
Set-Location 'D:\Dhyan\Self Projects\Provia\apps\mobile'
npm run verify:release
if ($LASTEXITCODE -ne 0) { throw 'Public release configuration failed.' }
npx eas-cli@latest build --platform android --profile preview
```

The APK needed for native acceptance is not yet built. Download it privately and
install as an update with the same signing identity (`adb install -r` using already
approved Android tools). Never uninstall, clear phone data or replace signing keys
to conceal an update failure.

Test on the A35: signed-out launch, new/duplicate/invalid registration, delayed email
without a false delivered claim, actual cold/warm verification/reset links, short
remaining lifetime, replay/expiration, resend cooldown, unavailable service, login,
restoration, offline/slow startup, background/resume, revoked sessions, logout and
account switch, onboarding, all six tabs and controlled cross-user denial. Confirm
new password works and old sessions fail after reset. Mocked tests do not prove this.

## 6. Existing users, rollback and final approval gates

Legacy identities and fitness UUID ownership remain. Email alone cannot claim old
history; controlled legacy enrollment is still unimplemented and broad cutover is
blocked on that workflow. New independent accounts cannot access old records.

For recovery, pause requests, coordinate a compatible backend/APK pair and preserve
0005/0006 tables plus keys. Do not downgrade populated application tables: dropping
0006 loses queued work and dropping 0005 loses credential/session history. A Phase 2
backend rollback also restores synchronous-mail timing exposure. Restoring a backup
over live writes is a separately approved recovery decision, not an automatic undo.
Do not remove old live Clerk credentials until the agreed rollback window ends.

Required separate approvals remain: private backup/restore and client tooling;
application migrations; repository publication/merge; actual sender/key/Render
configuration and manual deployment; unresolved tooling-risk acceptance; EAS build;
and real-device acceptance. Reliable always-on delivery on the available Free setup
is **not established**, and no production-readiness claim is made.
