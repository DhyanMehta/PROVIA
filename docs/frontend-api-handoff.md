# PROVIA frontend API handoff

Phase 4, 28 October 2026. This is the consumption contract for the local backend
source. Final verification/freeze evidence is in [the test report](backend-final-test-report.md).
It does not claim that Render, real mail or the installed Android APK runs this version.
Existing app data is at migration `0004`; approved `0005→0006→0007` rollout is still pending.

Use the generated [OpenAPI](../packages/api-contracts/openapi.json),
[TypeScript types](../packages/api-contracts/schema.d.ts) and complete
[67-path, 91-operation inventory](backend-endpoint-inventory.md). Do not maintain
parallel handwritten DTOs. Examples below are synthetic and contain no real credentials
or health records. Replace example UUIDs with returned UUIDs. All paths below are
relative to `/api/v1` unless the TypeScript example includes the prefix.

## A. Authentication

The API uses first-party authentication. No Clerk key, redirect, JWKS or SDK is needed
by this client. Authentication email and `/me` contact email are separate: PATCH `/me`
does not change login identity or verify an email. Existing Clerk-linked records must
not be claimed or merged by matching an email address.

1. POST `/auth/register`, public, with `RegisterIn`:

   ```json
   {"name":"Example user","email":"reader@example.com","password":"DEMO-ONLY-PASSWORD-CHANGE-ME"}
   ```

   A validated request returns **202** with exactly this generic response:

   ```json
   {"message":"If registration can proceed, check your email for verification instructions"}
   ```

   Account lookup/creation and mail occur in the private durable worker. A 202 does
   not prove eligibility, account creation or delivery. Render sleep can delay/expire
   a job. Do not poll for account existence; no public delivery-status API exists.
   Passwords require 15–128 characters and at most 512 UTF-8 bytes; preserve them exactly.
2. The user opens the verification email. The Android action route extracts the opaque
   token and requires explicit user confirmation; do not log the URL/token or consume
   it automatically. POST `/auth/verify-email` with `{"token":"OPAQUE_EMAIL_ACTION_TOKEN"}`.
   Success 200 is `{"message":"Email verified. Sign in to continue"}`. Invalid, expired
   or reused links return `INVALID_ACTION`; request a new email.
3. POST `/auth/login`, public, with email/password and optional `device_label` (≤80 chars).
   Success 200 has the following `TokenOut` shape; placeholder token strings are not usable:

   ```json
   {
     "access_token":"EXAMPLE_ACCESS_TOKEN",
     "refresh_token":"EXAMPLE_REFRESH_TOKEN",
     "token_type":"bearer",
     "expires_in":900,
     "user":{"id":"10000000-0000-4000-8000-000000000001","email":"reader@example.com","name":"Example user","email_verified":true,"status":"active"}
   }
   ```

   `user.id` is the stable internal user UUID. Unverified valid credentials may return
   a pending-verification session; fitness routes then return 403. Use `/onboarding`.
4. Keep access tokens in memory. Persist the refresh token through the existing
   SecureStore-backed session controller. Restore by POST `/auth/refresh` with
   `{"refresh_token":"EXAMPLE_REFRESH_TOKEN"}`; success returns a complete new
   `TokenOut`. Atomically replace the previous credential. Refresh tokens rotate
   once; replay revokes the family. Serialize refreshes, persist the rotation marker
   before sending, and require login after an uncertain refresh response. Never
   retry an old refresh token blindly after a timeout or crash.
5. GET `/auth/me` with Bearer returns `AccountOut`. It requires a valid, persisted
   session but permits pending verification. POST `/auth/logout` accepts the refresh
   token and returns `{"message":"Signed out"}`. Clear local auth state through the
   controller, including its serialized pending-logout handling. An offline local
   logout is not proof of remote revocation. Auth responses use `Cache-Control: no-store`.

Other flows:

| Flow | Request and response |
| --- | --- |
| Resend verification | POST `/auth/resend-verification` `{email}` →202 generic `MessageOut`; allow bounded retry UI, never claim a mail was sent |
| Forgot password | POST `/auth/forgot-password` `{email}` →202 generic `MessageOut`; same enumeration protections |
| Reset password | POST `/auth/reset-password` `{token,new_password}` →200; sessions revoked; login again |
| Change password | Authenticated POST `/auth/change-password` `{password,new_password}` →200; sessions revoked; login again |
| Sessions | GET `/auth/sessions` →at most100 unrevoked/unexpired `SessionOut` entries, newest first; `current` identifies this family |
| Revoke session | DELETE `/auth/sessions/{session_id}` →204; foreign/missing ID404 |
| Logout all | Authenticated POST `/auth/logout-all`, no body →200; requires a fresh login afterward |

An unavailable mail configuration is 503 `EMAIL_UNAVAILABLE`. Jobs accepted earlier
can still fail/expire in the worker. Never bypass email verification. Real sender/key
configuration, actual inbox delivery and legacy enrollment remain external gates.

## B. Onboarding and goals

GET `/onboarding` requires a session and permits pending verification. It returns
derived `authenticated`, `email_verified`, `profile_exists`, `active_goal_exists`,
`onboarding_complete`, `next_step`, full nullable `profile` and full nullable `active_goal`.
There is no independently writable onboarding flag. Choose the initial screen in this order:

| Result | Screen |
| --- | --- |
| No restored session /401 | Welcome or login |
| `next_step=verify_email` | Verification instructions |
| `next_step=profile` | Profile setup |
| `next_step=goal` | Goal setup |
| `next_step=dashboard` | Main dashboard |
| Disabled account403 | Account-disabled state; do not show fitness data |

GET `/profile` returns404 before setup. PUT `/profile` creates/replaces the complete
profile; required fields are display_name, height_cm, current_weight_kg and activity_level:

```json
{"display_name":"Example user","date_of_birth":"1998-05-15","height_cm":"175","current_weight_kg":"97","activity_level":"moderate","preferred_weight_unit":"kg","timezone":"Asia/Kolkata"}
```

DOB is optional, cannot be future and must be1900 or later. Height is positive up to
300cm; weights positive up to1000kg, with at most three fractional digits. These are
input bounds, not recommendations. Activity levels: sedentary/light/moderate/active/
very_active. Preferred units kg/lb affect presentation; all API weight values are kg.
Timezone is an IANA zone; omission defaults toUTC. PUT is replacement, so send retained
preferences explicitly. An explicit changed profile weight recalculates the active
calculated goal as a new revision; unchanged weight preserves its explicit snapshot.

POST `/goals`, optionally keyed, creates a goal; an active goal pauses the previous active one:

```json
{"goal_type":"weight_loss","target_weight_kg":"85","selected_deficit_kcal":"500","daily_steps_target":8000,"status":"active"}
```

Current weight may be supplied explicitly or taken from the profile. Target weight and
deficit are required. Goal types: weight_loss/muscle_gain/maintenance/general_fitness;
these are labels and do not change the formula. Status: active/paused/completed.
GET `/goals` is paginated newest-first. PATCH `/goals/{id}` edits owned goals;
calculation inputs, type or steps changes return a **new goal UUID**, preserving old
snapshots. Store the returned ID. Status-only changes use the existing transition policy.
Active goal retrieval for navigation comes directly from `/onboarding`, not the first
page of goal history. Null clearing is supported only where the schema allows it.

Stateless public calculation previews:

- POST `/nutrition/calculate-maintenance` `{"current_weight_kg":"97"}`.
- POST `/nutrition/calculate-goals` `{"current_weight_kg":"97","target_weight_kg":"85","deficit_kcal":"500"}`.

The approved formulas remain maintenance=`current×24`, daily=`maintenance−deficit`,
protein=`target×1.9`, fat=`current×0.7`, fiber=`daily/1000×14`, and carbs=
`(daily−(protein×4+fat×9))/4`. For97kg→85kg and500 deficit, daily=1828kcal,
protein=161.5g, fat=67.9g, fiber=25.592g, carbs=142.725g. Calculations use Decimal
without intermediate rounding; responses identify method/version and estimate status.
Nonpositive carbohydrate budget, excessive deficit or below-configured-minimum energy
returns422. Never substitute a frontend formula or silently clamp an impossible goal.

Weight-based goal confirmation:

1. POST `/weight-logs/{weight_id}/goal-preview`, no body. Response includes calculated
   targets, `base_goal_id`, `weight_log_id`, and `current_weight_kg_snapshot`.
2. POST `/weight-logs/{weight_id}/apply-goal`, optionally keyed, with both echoed values:

   ```json
   {"expected_goal_id":"10000000-0000-4000-8000-000000000002","expected_weight_kg":"96.125"}
   ```

3. Success201 returns a new `GoalOut`. `GOAL_CHANGED` or `WEIGHT_CHANGED`409 requires
   a new preview and explicit reconfirmation. **Phase4 intentionally requires
   `expected_weight_kg`**: accepting only a goal ID could apply a measurement edited
   after preview. This is the single intentional request-contract tightening; no
   existing mobile caller used this endpoint. Missing it now yields422.

## C. Foods, recipes and meal tracking

Search GET `/foods/search?q=rice&source=all&page=1&page_size=20`. Sources:
all/local/indian_curated/usda/open_food_facts. Query1–100 chars; page1–1000;
page_size1–100, default20. Response `SearchOut` contains items, provider_status,
page and page_size. Each selected source pages independently; this is not a globally
ranked cursor. All may contain up to three selected source pages before UUID deduplication.
Use a provider-specific source for predictable provider pagination. Healthy provider-only
results exclude unrelated local foods; failures can return selected-source catalog
fallback labeled `cached_catalog`. `ok`, `cached`, `rate_limited`, `timeout`,
`network_failure`, `not_configured`, `invalid_response` and other safe categories are
informational. Total provider failure without local/stale data is503. Local search
prioritizes attributed curated foods, then own custom foods, then other cached sources;
ties use name/UUID. Remote provider ordering belongs to the provider.

Food UUIDs are backend IDs. `source_food_id` is a provider identifier, not an accepted
replacement for a UUID. GET `/foods/{food_id}` returns per100g nutrients, source,
attribution and reliable gram portions. Missing nutrients are null. GET
`/foods/{food_id}/nutrition?quantity_g=57.5` performs authoritative quantity scaling;
positive grams≤100000, at most three decimal places. Never assume a bowl, spoon or
liquid density. Barcode GET `/foods/barcode/1234567890123` accepts8–14ASCII digits;
404 means no supported gram-based item,503 means unavailable provider,422 invalid input.
This does not verify a product's label or license for every possible downstream use.

POST `/foods/custom`, optionally keyed, creates a private measured food:

```json
{"name":"Synthetic measured food","food_kind":"ingredient","aliases":["my measured food"],"calories_kcal":"100","protein_g":"10","carbs_g":"10","fat_g":"2","fiber_g":null,"portions":[{"label":"measured portion","grams":"50"}]}
```

Do not present synthetic example values as nutrition facts. Use actual measured/label
data and preserve unknowns. Food kinds are unspecified/ingredient/prepared_dish.
Verified Indian-food coverage remains blocked pending an approved dataset; user
custom foods and recipes are the labeled fallback. Aliases do not manufacture values.
USDA/OFF data retain their source attribution; check license/share-alike obligations
before redistributing a derived catalog. No restricted database was scraped.

POST `/recipes`, optionally keyed, creates an immutable recipe and its private food:

```json
{"name":"My measured recipe","yield_g":"500","ingredients":[{"food_id":"10000000-0000-4000-8000-000000000003","quantity_g":"200"}],"portions":[{"label":"measured bowl","grams":"125"}]}
```

Supply final cooked yield, actual ingredients including oil/ghee and combined repeated
ingredient quantities. GET `/recipes` lists own recipes with limit/offset; GET
`/recipes/{id}` retrieves one. `RecipeOut.food.id` is directly usable in meals.
Unknown ingredient nutrients propagate null and `incomplete=true`. Recipe changes
require a new recipe; no edit/deletion endpoint is claimed.

POST `/meals`, optionally keyed, creates the entire meal atomically:

```json
{"meal_type":"lunch","consumed_at":"2026-10-24T12:30:00+05:30","notes":null,"items":[{"food_id":"10000000-0000-4000-8000-000000000003","quantity_g":"50"}]}
```

Meal types are breakfast/lunch/dinner/**snack** (singular). There must be1–100 items.
Use positive quantity_g≤100000, or portion_id+positive portion_count≤1000, exclusively.
The portion must belong to the selected food. Omitted consumed_at defaults to now.
Success201 returns `MealOut`: stable id, type, timestamp, notes, item IDs/quantities,
per-item nutrient snapshots and totals. For a50g serving of the synthetic example,
calories=50, protein=5, carbs=5, fat=1, fiber=null. Snapshot values round HALF_UP to0.001.

- GET `/meals?date=2026-10-24&limit=20&offset=0`: local-day meals, newest first.
- GET `/meals?start_date=2026-10-01&end_date=2026-10-24`: inclusive range≤366days.
  `date` cannot be combined with a range. Omit all date filters for paginated full history.
- GET `/meals/{id}`: owned meal detail. PATCH same path: change notes/time/type or
  replace the complete `items` list to correct quantities. Item replacement explicitly
  recalculates snapshots; notes/time-only changes do not. DELETE returns204.
- GET `/nutrition/daily?date=2026-10-24`: totals, historically applicable targets and meals.
- GET `/nutrition/dashboard?date=2026-10-24`: calories and protein/carbs/fat/fiber
  target/consumed/remaining budgets; macro kcal equivalents; calculation method/version.

Catalog changes never rewrite logged snapshots. Unknown included nutrients make only
that nutrient total null. Empty daily totals are zero; missing target/unknown consumed
means null remaining. Remaining nutrition may be negative; never silently floor it.
Daily nutrition and the unified daily dashboard accept at most100meals on one local
date (each API-created meal has at most100items). More returns422 `ANALYTICS_LIMIT`
before aggregation; no partial total is returned. Paginated meal history remains
available to inspect/correct the entries. Historical progress keeps its separate
10000-row query bound.

## D. Workouts

GET `/exercises` supports q, muscle_group, equipment, category and limit/offset.
Categories are strength/cardio/mobility/flexibility/bodyweight; detail GET
`/exercises/{id}` includes existing muscle/equipment/instructions metadata. Shared
and own unarchived entries are visible. POST `/exercises/custom`, optionally keyed,
requires name, muscle_group, equipment and **category**; PATCH edits own custom data,
DELETE archives it. Archived references remain readable in history, but cannot be
added to new plans/sets. Media references are stored only; the backend does not fetch them.

POST `/workout-plans`, optionally keyed:

```json
{"name":"Weekly plan","is_active":true,"days":[{"day_of_week":0,"name":"Pull","exercises":[{"exercise_id":"10000000-0000-4000-8000-000000000004","order_index":0,"target_sets":3,"target_reps":8,"target_weight_kg":"20","rest_seconds":90}]}]}
```

Days0=Monday..6=Sunday;≤7unique days,≤50exercises/day, unique order_index.
is_rest=true requires an empty exercise list. GET collection uses limit/offset;
GET detail returns full schedule. PATCH supplied `days` replaces the complete schedule
atomically, implementing exercise add/remove/reorder. DELETE removes the schedule
while preserving sessions and start-time snapshots. POST `/{plan_id}/duplicate`,
optionally keyed, creates an inactive copy with new IDs. Key identity binds the source
plan. Creating/activating a plan deactivates the previous active plan.

Session lifecycle:

1. GET `/workout-sessions/active` returns the newest active session across all time,
   or null. Start POST `/workout-sessions`, optionally keyed, with
   `{"started_at":"2026-10-24T17:00:00Z"}` and optional own workout_plan_day_id/notes.
2. A new start with any existing active session returns409 `ACTIVE_WORKOUT_EXISTS`.
   Existing legacy duplicates are retained; list with `status=in_progress` and an
   appropriate date range to complete/cancel each. Never invent a replacement session.
3. POST `/workout-sessions/{id}/sets`:

   ```json
   {"exercise_id":"10000000-0000-4000-8000-000000000004","set_number":1,"reps":8,"weight_kg":"20","kind":"working","is_completed":true}
   ```

   A session/exercise/set_number is unique; duplicate POST409. PATCH nested set ID
   corrects reps/weight/completion/notes while active. DELETE removes an incorrect set.
   Completed sets require positive reps or duration; completed+skipped is invalid.
4. POST `/workout-sessions/{id}/complete` `{"completed_at":"2026-10-24T18:00:00Z"}`.
   Completion must follow start strictly; all stored sets must be completed/skipped.
   Duration-only sessions with no sets remain valid. Repeated completion is409.
5. PATCH `/workout-sessions/{id}` `{"status":"cancelled"}` cancels an active session.
   Completed/cancelled sessions cannot reopen or be edited. GET detail preserves sets,
   exercise-name snapshots and plan snapshots. History list accepts status/date range/
   limit/offset and sorts by start thenUUID ascending.

GET `/workouts/summary` or `/workouts/progress` gives completed-session frequency,
duration, working-set volume, active-day consistency and actual range-scoped records.
GET `/workouts/exercises/{exercise_id}/history` includes actual sets. Warmup/skipped/
unfinished/cancelled sessions do not count toward working volume. Zero load is valid
for bodyweight/duration exercises. Records are observed maxima, never invented1RM.

## E. Weight, water, activity and sleep

| Feature | Create/read/update/delete path and semantics |
| --- | --- |
| Weight | POST `/weight-logs` `{weight_kg,recorded_at?}` →201, optional key; source defaults manual. GET collection supports limit/offset and optional local start/end; newest first. GET `/latest` returns404 if absent. GET/PATCH/DELETE `/{id}`; PATCH only weight/time, DELETE204. Measurement changes never silently change profile/goals. |
| Imported weight | Add `source=health_connect`, stable `external_id`≤200chars and explicit recorded_at; exact POST replay returns same record, changed measurement409 `SOURCE_RECORD_CONFLICT`; correct using owned PATCH. Manual rows cannot supply external_id. Source identity is immutable. |
| Water | POST `/water-logs` `{amount_ml,consumed_at}` →201, optional key. Positive amount≤10000ml,≤3fractional digits. GET range-paged collection; PATCH amount/time; DELETE204. PUT `/water/target` `{effective_date,target_ml}` sets/replaces that date's target (0<target≤20000). GET `/water/dashboard?date=...` returns target/consumed/remaining/logs/has_logs. No target is assumed; remaining water is floored at0. |
| Activity | PUT `/activity/daily` `{activity_date,steps,source?}` replaces a complete day; never increments. GET same path with date returns row or null; GET `/activity` is range-paged. DELETE `/activity/daily?date=...` is owned repeat-safe204, including absent dates. GET `/activity/summary` provides observed-day count/steps/range records. |
| Imported activity | `source=health_connect` requires synced_at; optional distance_m,active_minutes,activity_calories. Newer complete snapshots replace; older409 `STALE_SYNC`; same timestamp/different body409 `SYNC_CONFLICT`; exact replay retainsID. Import supersedes manual; manual overwrite409 `SOURCE_CONFLICT`. Missing fields become null. |
| Sleep | POST `/sleep-sessions` `{started_at,ended_at,source?,external_id?,stages?,notes?}` →201, optional key. GET range-paged collection/detail; PATCH time/stages/notes; DELETE204. Health Connect requires stableexternal_id; exact replay returns sameID, changed imported content409 requiresPATCH. Source identity cannot change. |

Weight timestamps cannot be future; all timestamps require an offset. Steps0–200000,
distance0–1000000m, active_minutes0–1440 and activity_calories0–100000kcal are validation
bounds. synced_at over five minutes ahead is422. Activity calories are informational,
never added to the nutrition budget. Known zero is different from no row or null metric.

Sleep elapsed duration must be positive and≤24h; own sessions cannot overlap. Optional
stages (awake/light/deep/rem/sleeping/unknown) must be ordered, nonoverlapping and within
the interval. Overnight records belong to local wake-up date. Elapsed duration includes
awake intervals and is not inferred asleep time. GET `/sleep/summary` returns dated
durations and sessions; missing days have null duration.

Future native sync must follow [Health Connect boundaries](health-connect-integration.md):
one authoritative client, account-scoped external-ID mapping, complete-day activity
snapshots, source precedence, owned corrections/deletions and explicit consent.
No native integration, server tombstones or multi-device merge is claimed. Cancel old
queued operations when deleting; unkeyed imports/activity PUT can otherwise recreate
deleted rows. Permission/read failures are unknown, never zero uploads or inferred erasure.

## F. Unified dashboard and analytics

GET `/dashboard/today` defaults to today in the profile timezone; optional date allows
historical display. One response contains nutrition budgets, water, activity, sleep,
workout summary, latest actual weight before local day-end, and nullable historical
goal context (id/type/target weight/current-weight snapshot/steps target). No measurement
means `weight=null`; profile weight is not fabricated as a measurement. Use `/onboarding`
for current navigation state; a historical dashboard goal is not current setup state.

GET `/progress/overview?start_date=2026-10-01&end_date=2026-10-07` requests seven inclusive
days; use October1–30 for thirty days. Defaults:30days ending today; omitted start with
supplied end means30days ending there. Ordered ranges≤366days, years1900–9998.
The response includes daily water/activity/sleep/nutrition, weight history/change,
water consistency and workout analytics. Weight change is last minus first observed
measurement, null with fewer than two. No missing measurement is interpolated.

Each daily nutrition point retains calorie consumed/target/adherence/goal_id and adds
protein/carbs/fat/fiber `{target_g,consumed_g,remaining_g,adherence_ratio}`. Ratios are
consumption/target, not percentages or scores; may exceed1. Null/zero target yields
null ratio. No meal logs yields null consumed/remaining/adherence even if a target is
known. Unknown nutrient snapshots propagate null independently. Observed zero stays
zero. This differs deliberately from empty-day daily nutrition totals, which are zero.

Historical targets use the last goal transition strictly before local day-end; the
last same-day change applies to the whole day, including pauses. Profile timezone
changes reinterpret grouping. Analytics queries are batched, bounded to10000rows per
query; excess returns422 `ANALYTICS_LIMIT`, not truncated success. Shorten the range.
Personal records are range-scoped. Current week/month workout counts are independently
calculated through current local today. See [analytics details](phase4-insights-handoff.md).

## G. Errors and diagnostics

Errors use one envelope. Dynamic inputs, provider responses and internal exception
messages are not echoed:

```json
{"error":{"code":"RESOURCE_NOT_FOUND","message":"Record was not found","details":null}}
```

Validation `details` contain only safe source/code/message items. `X-Request-ID` is a
server-generated response header for correlation; it is not a JWT or user identifier.

| HTTP | Meaning / frontend behavior |
| --- | --- |
| 400 | Invalid protocol/input operation, e.g. ambiguous content length; fix request, do not retry unchanged |
| 401 | Missing/invalid/expired/revoked session or invalid credentials; existing controller may refresh one GET once, then login |
| 403 | `EMAIL_NOT_VERIFIED` or `ACCOUNT_DISABLED`; show the precise allowed state, never treat as backend downtime |
| 404 | Missing or foreign-owned resource; do not infer another user's record exists. Empty activity/active-workout instead return200null; latestweight absent404 |
| 409 | Lifecycle/concurrency/identity conflict. Reload/reconcile. `IDEMPOTENCY_CONFLICT` means changed body/key misuse; `IDEMPOTENCY_RESOURCE_DELETED` means never recreate that operation. `GOAL_CHANGED`/`WEIGHT_CHANGED` require new preview. |
| 422 | Schema/quantity/date/range/calculation validation; correct values. `ANALYTICS_LIMIT` requires shorter range. No internal input dump is returned. |
| 429 | Rate limit; respect Retry-After. Auth limit response uses900seconds. No retry loop. |
| 503 | Infrastructure/configuration/provider failure: inspect safe code (`DATABASE_UNAVAILABLE`, `AUTH_UNAVAILABLE`, `EMAIL_UNAVAILABLE`, `FOOD_PROVIDERS_UNAVAILABLE`). This is distinct from401/403. |
| 413 /500 | Body too large /sanitized unexpected server failure; reduce payload or correlate request ID and report safely |

Health `/health` is process liveness, `/health/ready` means initialization only, and
`/health/db` checks database connectivity. Cold start is a possible explanation for
delay, not established by any timeout alone. Never collapse malformed success JSON,
network failure, timeout, authentication failure and database503 into one diagnosis.

## H. Mobile transport and retry rules

Public configuration base URL is `https://provia-mag7.onrender.com/api/v1`. It must be
HTTPS for release. The source contract is newer than the live service until approved
deployment; verify deployed schema/readiness rather than assuming URL parity. Public
API URLs are not credentials; server JWT/encryption/provider/database secrets never
belong in `EXPO_PUBLIC_*`, SecureStore logs, screenshots or client bundles.

The existing typed `createApiClient` uses generated paths. Bearer is
`Authorization: Bearer <access_token>`. Route templates use `params`; never append raw
unescaped IDs or tokens. Successful204 deletion resolves to typed `undefined` without
parsing a JSON body. The optional `idempotencyKey` option sends the UUID header:

```typescript
const result = await api.request("post", "/api/v1/water-logs", {
  idempotencyKey: queuedOperation.uuid,
  body: queuedOperation.body,
});
```

Persist the operation's UUID and complete explicit body before the first send;
reuse both after uncertain network results. This header is supported on POST custom
foods, recipes, meals, custom exercises, workout plans, plan duplication, workout
sessions, water, sleep, weight, goals and weight/apply-goal (**12 operations**).
Keys are scoped by authenticated user and operation; nested duplication/apply binds
the parent ID. Changed input409. A replay returns the current original record, which
may now be edited/completed, with its normal201 status; no exactly-once network claim.
No key means ordinary create behavior. Receipts persist until owner deletion.
Do not attach these retry semantics to auth action/refresh consumption.

The client deadline covers token acquisition, transport and body parsing: default
GET90seconds, other methods45seconds; the session controller explicitly allows90seconds
for login/refresh and15seconds for logout. SecureStore waits are bounded to10seconds
while writes remain serialized.
The API client retries one authenticated GET after401 through single-flight refresh;
it **never automatically retries writes**. An abort/timeout after sending is an
uncertain save, not proof of rollback. Keyed retries may reconcile; for unkeyed
operations fetch current state and ask for an explicit retry when necessary.

Provider calls have bounded timeouts/retries and fail-fast contention; cached/local
data may remain available. There is no guaranteed end-to-end latency SLA. Show a
cancel/retry state when deadlines expire; never leave an infinite connecting spinner.
Retain safe HTTP/code/category/request-ID diagnostics only. Generated TypeScript types
do not validate runtime JSON; use existing response validators before declaring success.

Collections use `limit=20` default,1–100, offset≥0, `{items,limit,offset}`. Stop on a
short page; exact-full pages may require one final empty request. Concurrent changes
can shift offset pages; dedupe IDs and refresh after edits. Food search differs as
documented above. Tracking ranges sort timestamp+UUID ascending; weight/meals/goals/
plans use newest-first; exercise/local foods use named ordering. Never assume all
collections share one direction.

Use ISO date-only strings for local calendar keys and offset-aware instants for
recorded times. Date ranges are inclusive local dates converted to half-open UTC
intervals; DST days may be23/25hours. Preserve IANA timezone on profile updates.
API units remain kg/cm/g/ml/m/kcal/seconds; use Decimal-safe formatting and preserve
returned strings, not binary-floating-point formulas or assumed trailing zeros.

There is no server offline mode, automatic generic sync queue, tombstone reconciliation
or permission-revocation purge. Queue state must be account-scoped, cancelled when
obsolete and never uploaded under a different account. Offline UI must distinguish
unsynced/pending, conflict, unavailable and confirmed success.

## Feature-to-endpoint consumption matrix

| Android feature | Primary endpoints / generated response |
| --- | --- |
| Welcome/login/recovery/sessions | `/auth/*` →MessageOut/TokenOut/AccountOut/SessionOut |
| Initial screen/setup | `/onboarding` →OnboardingOut; `/profile` →ProfileOut; `/goals` →GoalOut |
| Food selector/barcode/manual recipe | `/foods/search`, `/foods/barcode/{barcode}`, `/foods/custom`, `/recipes` →SearchOut/FoodOut/RecipeOut |
| Quantity/meal editor/history | `/foods/{id}/nutrition`, `/meals` and detail →FoodQuantityOut/MealOut |
| Nutrition budgets | `/nutrition/daily`, `/nutrition/dashboard` →DailyOut/DashboardOut |
| Exercise/plan editor | `/exercises`, `/workout-plans` and detail →ExerciseOut/PlanOut |
| Workout runner/history | `/workout-sessions/active`, collection/detail/sets/complete →SessionOut/SetOut |
| Weight measurement/goal confirmation | `/weight-logs`, `/latest`, preview/apply →WeightOut/WeightGoalPreview/GoalOut |
| Water logger | `/water-logs`, `/water/target`, `/water/dashboard` →WaterOut/TargetOut/WaterDashboard |
| Activity/sleep | `/activity`, `/activity/daily`, `/sleep-sessions`, summary APIs →ActivityOut/SleepOut |
| Home/progress charts | `/dashboard/today`, `/progress/overview`, `/workouts/*` →DailyDashboard/ProgressOverview/WorkoutSummary |
| Future Health Connect | Same owned activity/sleep/weight APIs under the bounded source contract; native integration pending |

Local tests and contract checks are recorded separately from real delivery, Render and
device acceptance. See [remaining limitations](backend-remaining-limitations.md)
before claiming a production rollout or an already accepted Android integration.
