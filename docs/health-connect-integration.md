# Android Health Connect backend integration

Health Connect access runs on the Android device. PROVIA's Python API stores
authenticated client submissions; it has no server-side Health Connect connection
and cannot attest that a submitted total came from a sensor. Device verification is
PENDING. Backend boundary tests use representative payloads and real PostgreSQL.

## Client acquisition

Request only needed read permissions: READ_STEPS for StepsRecord, READ_DISTANCE for
distance, READ_ACTIVE_CALORIES_BURNED for active calories, and READ_SLEEP for sleep.
Check permission availability/grants before each sync. History/background access
requires the corresponding platform support and permission; don't assume all history
is readable. Review [Health Connect permissions](https://developer.android.com/health-and-fitness/health-connect/get-started)
for the selected Android SDK. Backend `active_minutes` has no automatic one-to-one
sensor mapping: leave null until the client has an explicit definition and verified
data source. Do not substitute total calories for active calories.

Use Health Connect aggregation for daily steps instead of summing overlapping raw
records from multiple origins. Source priorities and deduplication are platform concerns;
do not add watch/phone totals again. Aggregate the complete local-day interval in the
profile timezone, including23/25-hour DST days. Keep origin filters consistent across
retries. See [aggregation](https://developer.android.com/health-and-fitness/health-connect/aggregate-data).

For raw changes, retain record metadata.id, lastModifiedTime and dataOrigin locally;
clientRecordId/clientRecordVersion concern the writing app and may not exist on
another app's data. DeletionChange supplies only an ID, so retain an ID-to-type/day
mapping. Drain changes pages and persist a durable pending-sync queue before advancing
the checkpoint. An invalid/expired changes token needs a bounded rescan and reconciliation,
not an invented empty result. See [Android synchronization](https://developer.android.com/health-and-fitness/health-connect/sync-data).

## Daily activity snapshot contract

PUT `/api/v1/activity/daily` sends one complete canonical snapshot for an authenticated
user and `activity_date`. Identity comes from the bearer token. There are no client
user IDs, batch writes or per-origin server rows. This payload matches ActivityPut:

```json
{
  "activity_date":"2026-10-24",
  "steps":5200,
  "distance_m":"3500.125",
  "active_minutes":null,
  "activity_calories":"180.500",
  "source":"health_connect",
  "synced_at":"2026-10-24T17:00:00Z"
}
```

`synced_at` is the client's snapshot-generation time, not a Health Connect sequence
number, record-modified time or activity date. Use the same value and identical body
for an offline retry. A newly completed rescan gets a newer timestamp, even when
historical totals decrease. Reject device clocks more than five minutes ahead of the
server; repair clock skew rather than continually rewriting timestamps on retry.
Same timestamp/same body returns the same row; same timestamp/different body returns
409 SYNC_CONFLICT; older snapshots return409 STALE_SYNC. Steps must be0–200000,
distance0–1000000m, active minutes0–1440, active calories0–100000. Decimal metrics allow
three fractional digits. Missing steps, unsupported source values, naive timestamps,
extra identity metadata and arrays fail422. Imported data supersedes manual data;
manual writes cannot replace an imported day (409 SOURCE_CONFLICT).

The explicit local date is the storage key. Do not derive it from UTC upload time.
Serialize synchronization for a user/day on one authoritative client. Multiple
devices with unsynchronized clocks cannot establish a trustworthy global version;
the server is last-newer-snapshot-wins, not a multi-device merge protocol.

## Reconciliation and limits

The model supports repeated full-day snapshots, historical corrections and deletion
effects by replacing totals with newly recomputed lower values (including known zero).
It is sufficient for this complete-snapshot contract and needs no new table/migration.
It cannot merge partial pages, source-specific deltas or independently supplied
origin totals. Aggregate all relevant sources on-device before sending. Never send
a partially read day as complete. Optional fields omitted from a PUT become null;
they do not preserve previous metrics. Permission loss or failed reading is unknown,
not zero: stop the upload and keep existing server data pending explicit reconciliation.

There is no activity-row deletion API or server deletion tombstone. Source-specific
audit/reconstruction, automatic deletion notifications, permission-revocation erasure,
restore of an earlier manual value and multi-device conflict-free merging are not
implemented. Deleting all underlying steps can be reflected as zero only after a
successful complete authorized reread. An account-erasure/retention workflow requires
separate production work; do not silently equate permission revocation with consent
to retain indefinitely or with an implemented deletion mechanism.

## Sleep records

POST `/sleep-sessions` uses `source=health_connect` and a stable `external_id` based
on the Health Connect record ID (maximum200 characters); keep an account-scoped local
mapping to the returned PROVIA ID. Identity uniqueness is per user/source/ID. Identical
replay returns the same row; changed content returns409 and must PATCH the owned
PROVIA ID. Source/external ID cannot be changed by PATCH. GET/PATCH/DELETE require
ownership. DELETE can reconcile a known deleted record, but no tombstone prevents
an old queued POST from recreating it: remove obsolete uploads from the client queue.

Sleep intervals require explicit offsets, positive elapsed duration at most24h and
no overlap with the same user's sessions. Stages are optional, ordered, nonoverlapping
and within the session. Map only supported stages awake/light/deep/rem/sleeping/unknown;
do not infer stages, and handle platform-specific awake variants explicitly in the
client mapping. Elapsed duration includes awake stages; it is not an inferred asleep
metric. Summaries use local wake-up date. Overlapping records from different origins
need client-side selection/reconciliation before upload. Offline conflicting PATCHes
have no record-version compare-and-swap; serialize them on the authoritative client.

## Real-device checklist — not executed

- Verify supported Android/Health Connect versions, installation and permission UX.
- Compare app totals against Health Connect with phone and watch origins; verify no
  duplicate contribution and stable origin filters.
- Verify midnight, profile-zone changes, travel and both DST transitions.
- Import, retry offline, change historical data, delete records, and confirm full-day
  recomputation with lower/zero totals and stale-upload rejection.
- Exercise paged changes, expired checkpoints, permission loss and partial read failure.
- Verify sleep IDs, edits/deletes, overlapping origins and supported stage mappings.
- Switch Clerk accounts with queued data; confirm no cross-account upload or local leak.
- Confirm revoked permissions stop reads and apply the product's explicit data policy.
- Record device/SDK versions and outcomes without credentials or raw personal records.
