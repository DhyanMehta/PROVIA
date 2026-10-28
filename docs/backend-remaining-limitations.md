# Backend remaining limitations

Phase 4, 28 October 2026. Local business-code readiness and live acceptance are
separate. The [test report](backend-final-test-report.md) is the authority for executed
checks; this document must not be read as a deployed or production-ready claim.

## External acceptance gates

- The existing application database remains at `0004`. Migrations `0005`, `0006` and
  additive `0007` require separate approval, a real backup/restore plan and controlled
  verification before deployment. Disposable database tests do not migrate Neon app data.
- Render publication, live configuration, worker/intake activation and deployment
  were not performed. Existing service identity and free plan remain intact.
- Real Resend sender/domain permission, encryption-key custody and inbox delivery are
  not verified. A 202 acknowledges a durable intent; it does not prove an account was
  created or a message delivered. Expired jobs terminate safely. Never bypass verification.
- Render Free can sleep or suspend; no worker runs while asleep. There is no guaranteed
  email turnaround SLA, and 15/30-minute jobs may expire before wake. Active polling
  can consume Neon's free compute allowance. No paid service, keep-alive ping, external
  cron or public queue drain was introduced. Preview testing must account for wake time.
- No new APK/cloud build or Android device test was performed. The installed old APK
  and existing deployed API are not evidence of this source's acceptance. Health Connect
  native permission/read/change ingestion remains a future Android task.
- A verified, legally reusable Indian-food dataset remains unavailable. The catalog
  importer requires source attribution/license/operator verification; no values or
  broad Indian-dish coverage are invented. Custom measured foods and recipes are the
  explicit fallback. External search may return Indian products/ingredients, which
  does not establish verified generic dish coverage or accuracy.
- Clerk-linked legacy UUIDs/history are preserved. Automatic email matching is forbidden.
  An approved, independently verified legacy enrollment workflow is still required for
  broad legacy cutover. A new independent account cannot access the old history.

## Bounded MVP behavior

- Optional UUID retry keys protect the twelve documented create/duplicate/apply routes. Callers that omit
  keys retain normal create semantics and must reconcile uncertain writes. Reuse the
  same explicit body and key; do not generate a new key on timeout. Replays return the
  current record, possibly edited/completed, not an immutable copy of the first HTTP
  response. Deleted keyed resources conflict rather than being recreated. Receipts
  remain until owner deletion; offline retries have no finite expiry policy yet.
- Health Connect activity is a full-day snapshot from one authoritative client, not
  a merge of source deltas or arbitrary devices. Weight/sleep imports have stable source
  IDs and owned correction/deletion, with client-side serialization and queue cancellation.
  There are no import tombstones or optimistic record versions. A stale unkeyed import
  or activity PUT can recreate deleted data; discard obsolete queued operations. Permission
  loss/failed reads mean unknown, never zero, and do not imply a completed server erasure
  policy. Health Connect is backend-ready under this bounded contract, not integrated.
- API values are metric; preferred kg/lb is presentation preference. Weight history and
  profile current weight are separate. Recording/correcting/deleting a measurement does
  not silently change a goal or profile. Explicit preview/confirmation creates a new goal.
- Profile timezone changes reinterpret historical calendar grouping. No historical zone
  snapshots are invented. Sleep duration is elapsed interval including awake stages,
  not a medical asleep estimate. Workouts may legitimately be duration-only.
- Food search pages each selected source independently. It is not a globally ranked,
  stable cross-provider cursor. Providers can change their results and rate limits;
  cached catalog entries need not reflect later remote edits. Null nutrients remain
  unknown. Serving conversions require known gram portions; unsupported liquid basis
  is not guessed. Provider normalization is not laboratory verification.
- Collection pagination is offset-based, so concurrent inserts/deletes can shift later
  pages. Deduplicate IDs and refresh after edits. Analytics rejects excessive ranges
  or row counts rather than silently dropping measurements. Daily nutrition/unified
  dashboards reject days exceeding 100 meals with 422; use paginated history to manage
  those records. No production throughput
  SLA follows from query-count tests or synthetic PostgreSQL fixtures.
- Offline queue persistence, conflict UX and Health Connect consent enforcement belong
  to the Android implementation. Server provenance labels are client assertions scoped
  by authorization, not a proof that data came from a trusted sensor.

## Release and operational risks

The dependency-audit result and its review date are in the final test report. Existing
Expo tooling risks must be reviewed before an EAS build; a forced incompatible major
override is not an approved fix. Audit absence does not prove supply-chain safety.

Backups/restore drills, production retention and account erasure, ingress connection
and request budgets, operational monitoring and a demonstrated mail availability plan
remain launch gates. Current scoped auth throttles are retained; general expensive
endpoints still require ingress abuse controls at public scale. No new cloud cost is
authorized. Final read-only inventory found three generated-name test databases;
two predate this phase and an interrupted run may account for the additional one.
Their ownership/cleanup is unconfirmed; do not delete them by prefix. Only test
databases created by the current runner may be
automatically removed by that runner.

Follow the [Phase 3 deployment runbook](phase3-deployment-runbook.md) for existing
key/mail/backup procedures and the [Phase 4 architecture](backend-final-architecture.md)
for the additional `0007` gate. Any unresolved acceptance gate stays blocked even
when local frontend contracts are frozen.
