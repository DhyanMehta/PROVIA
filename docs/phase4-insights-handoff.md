# Phase 4 dashboard, analytics and Health Connect handoff

Reviewed 28 October 2026. This supplements the generated OpenAPI and final frontend
handoff; it does not claim a deployed API, native integration or device acceptance.

## Existing dashboard

GET `/api/v1/dashboard/today` accepts optional `date=YYYY-MM-DD`. Omission means
today in the profile timezone, or UTC before a profile exists. It reuses the existing
nutrition, water, activity, sleep and workout services. Its `weight` is the latest
actual measurement strictly before the end of the requested local day, or null.
Profile current weight is not silently emitted as an observed measurement.

The additive nullable `goal` context comes from the same historical transition
timeline as nutrition targets, with `id`, `goal_type`, `target_weight_kg`,
`current_weight_kg_snapshot` and `daily_steps_target`. It is not the current active
goal substituted into a past day. A pause before day-end makes the context null.
Current setup/navigation state comes from GET `/onboarding`; historical goal
context must not be used to choose the current onboarding screen.

## Analytics

GET `/api/v1/progress/overview?start_date=2026-01-01&end_date=2026-01-07` requests
seven inclusive dates. Use January 1–30 for thirty dates or another explicit
ordered range. Existing defaults are the last thirty local dates ending today;
the range limit is 366 calendar dates. The current profile IANA zone defines UTC
boundaries, including 23/25-hour DST days. Changing profile timezone reinterprets
historical grouping. Queries are batched, not one query per returned date.

Existing calorie fields remain unchanged. Each daily `nutrition` point adds four
typed objects named `protein`, `carbs`, `fat` and `fiber`, each with the fields below:

```json
{
  "target_g": "150.00000000",
  "consumed_g": "165.000",
  "remaining_g": "-15.00000000",
  "adherence_ratio": "1.1"
}
```

All Decimal values serialize as strings; trailing zeros are not guaranteed. Targets
come from the applicable immutable goal snapshot. Consumed values sum stored meal
item snapshots. Remaining is target minus consumption and may be negative. Ratios
are consumption/target, not percentages or a medical nutrition-quality score; they
are not clamped. A missing/zero target yields null ratio. Any unknown included
nutrient makes that nutrient's consumption/remaining/ratio null without erasing
known other nutrients. An observed zero remains zero with ratio zero when the target
is positive. No meal logs means `has_logs=false`, null consumption/remaining/ratio;
an applicable target can still be returned. No measurements are fabricated for
missing days. The daily nutrition dashboard's empty-day zero-total semantics remain
unchanged; analytics distinguishes observation from absence explicitly.

The final report records the coordinator's real PostgreSQL execution. This workstream
adds seven unit cases and two PostgreSQL cases covering these contracts, historical
goals, DST boundaries, unknown/zero values, cross-user isolation and query-count
independence between seven and thirty days. Query counts do not establish a latency
or production throughput SLA. Existing 10,000-row analytics bounds reject oversized
requests with 422 rather than silently truncating results. No speculative index or
schema change was added by this workstream.

## Future Android synchronization

The [Health Connect contract](health-connect-integration.md) now includes manual and
imported weight CRUD, stable source IDs, activity range/deletion, account boundaries
and queue reconciliation. Use one authoritative client and full-day activity snapshots.
Weight/sleep imports replay by external ID and use owned PATCH for corrections.
Optional UUID retry keys retain create identity after uncertain network results.
There are no import tombstones or optimistic versions: discard obsolete queued writes
before deleting data. Permission/read failures are unknown, never a zero-total update.
The backend accepts authorized client assertions and cannot attest sensor origin.
No Android permissions, native reads, change-token persistence or consent UI were
implemented or tested on a physical device during this backend workstream.
