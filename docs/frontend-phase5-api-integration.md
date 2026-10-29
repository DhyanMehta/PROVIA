# Phase 5 API integration

The Phase 4 backend, generated TypeScript contract, business formulas, schemas and
migrations remain frozen. Source is integrated against the existing generated DTOs;
no frontend-only endpoint or field has been invented. Real local HTTP evidence and
mocked component evidence are recorded separately in the test report.

The existing API client retains bounded request deadlines, single GET authentication
refresh, no automatic write retries, sanitized error categories/request IDs and
account-generation guards. The existing auth session controller still serializes
SecureStore operations, persists rotation markers before refresh and fails closed on
uncertain refresh. Access tokens remain memory-only; refresh credentials remain in
SecureStore. No credentials, JWTs or real health logs are added to diagnostics.

Each authenticated provider owns an in-memory, maximum-80-entry, 30-second GET cache.
It is destroyed on account/session changes. Successful writes and uncertain writes
invalidate mounted read models. A read begun before invalidation cannot repopulate
the cache. Authority and reconciliation reads use `cacheMs: 0`. Manual refresh,
foregrounding and a foreground minute tick refresh views, including profile-zone day
changes. Last successful screen data remains visible with an error after a failed
refresh; unrelated account data is never reused.

The mutation hook uses a synchronous ref latch against same-tick double submission.
Receipt-supported creates retain the original callback, exact constructed body and
UUID while the form is mounted. An explicit retry reuses that request; the app does
not retry writes automatically. Set creation has no receipt: it fetches the actual
session and compares the exercise/set tuple and submitted values before proceeding.
Other unkeyed edits/deletions require saved-record reconciliation. Navigation guards
protect drafts and unknown outcomes. This is not a durable offline queue: confirmed
discard or process death can lose ordinary mounted drafts/retry identity. Review saved
records before creating again. Onboarding separately persists an account-scoped goal
receipt and preserves legacy unresolved markers.

Nutrition previews and targets come from the server. Display ratios and chart scaling
do not replace nutrient calculations. Decimal strings remain strings in persisted
amounts; measured-portion multiplication uses integer arithmetic with HALF_UP rounding
to three places. Weight conversion uses exactly 0.45359237 kg per pound. Profile
replacement keeps unchanged canonical kg values instead of round-tripping a display
conversion. Historical goal and meal snapshots remain independent from current profile
or catalog edits.

Runtime decimal validators accept finite PostgreSQL NUMERIC exponent strings such as
`0E-8`. Exact decimal expansion formats these for display and editable goal defaults
without rounding a small recorded amount into missing data. The actual HTTP harness
checks persisted zero nutrients and source validators, independently of JSON fixtures.

Date-only keys use the profile's IANA zone. Date shifting uses a UTC calendar anchor;
it does not treat local dates as UTC instants. Timestamp forms require explicit offsets
and preserve backend microsecond strings. Native date controls use a profile-zone
fallback when Android's device-zone picker cannot represent that zone safely. Sleep
history uses the wake day. Unknown nutrients/activity/sleep values remain null rather
than being invented as zero; negative remaining nutrient budgets are displayed.

Food responses have no image field, so food photos are not fabricated. Exercise media
uses an existing validated HTTPS reference or a clear fallback. Recipes are immutable
under the frozen contract. Water edits originate from authenticated history/dashboard
data because no water-detail GET exists. Health Connect is an explicitly disabled
native boundary until its SDK 58/RN compatibility and device permissions are verified.

The deployed Render backend is older than this source. The application database is
still at migration 0004; 0005–0007 and deployment require a separate approved release
step. Phase 5 does not migrate application data, change Render settings, activate email,
submit an EAS build, or claim that the installed older APK includes these changes.
