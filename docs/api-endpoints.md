# API endpoints

Default prefix: `/api/v1`. Swagger is `/docs`, schema is `/openapi.json`.
All routes below except health and calculation previews require a verified Bearer token. UUID IDs are
server generated. Requests reject unknown fields. Decimal numbers are returned as
strings to preserve precision. Request timestamps must include an offset; stored
timestamps are timezone-aware. The examples contain no credentials.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | /health | 200 process liveness; original Task 1 JSON preserved |
| GET | /health/ready | 200 application initialization only |
| GET | /health/db | 200 after SELECT 1; sanitized 503 otherwise |
| GET | /me | Local user ID, email, created/updated timestamps |
| PATCH | /me | Change contact email; never provider subject or authorization identity |
| GET | /profile | Own profile; 404 before onboarding |
| PUT | /profile | Create or replace own profile |
| POST | /goals | 201; create historical goal, pausing previous active goal if needed |
| GET | /goals | Paginated own goals, newest first |
| PATCH | /goals/{goal_id} | Update own goal; 404 for foreign/missing ID |
| POST | /weight-logs | 201; append measurement, never overwrite history |
| GET | /weight-logs | Paginated history, newest recorded_at first |
| GET | /foods/search | q (1–100 chars); source=all/local/indian_curated/usda/open_food_facts |
| GET | /foods/{food_id} | Local cached/shared or own custom food UUID, with portions |
| POST | /foods/custom | 201; private food, per 100 grams, optional portions |
| POST | /meals | 201; atomic meal plus items and snapshots |
| GET | /meals | Paginated; optional date=YYYY-MM-DD in user's timezone |
| GET | /meals/{meal_id} | Own meal, items, and totals |
| PATCH | /meals/{meal_id} | Partial fields; supplied items replaces entire item list |
| DELETE | /meals/{meal_id} | 204 with no body; deletes meal and its items |
| GET | /nutrition/daily | Required date; totals, historically applicable targets, meal breakdown |
| GET | /nutrition/dashboard | Required date; targets, consumed, remaining, macro calorie equivalents |
| POST | /nutrition/calculate-maintenance | Public stateless weight × 24 estimate |
| POST | /nutrition/calculate-goals | Public stateless full target preview |

List pagination: `limit` defaults to 20 (1–100); `offset` defaults to 0.
Response: `{ "items": [...], "limit": 20, "offset": 0 }`.
Food search instead returns `{ "items": [...], "provider_status": {...} }` with a
bounded result set. Search imports supported provider records into the local catalog;
returned UUIDs can be used directly in meal requests. No external provider ID is accepted
as a local UUID. Provider failures are explicit; stale/local results can still be returned.

## Profile

```json
{
  "display_name": "Example",
  "height_cm": "175.00",
  "current_weight_kg": "70.000",
  "activity_level": "moderate",
  "preferred_weight_unit": "kg",
  "timezone": "Asia/Kolkata"
}
```

Optional `date_of_birth`. Activity: sedentary/light/moderate/active/very_active.
Weight preference: kg/lb; API quantities always metric. Height/weight must be positive,
at most 300 cm / 1000 kg (broad data-validation bounds, not health recommendations).

## Goals and weights

```json
{"current_weight_kg":97,"target_weight_kg":85,"deficit_kcal":500,"status":"active"}
```

Goal types: weight_loss, muscle_gain, maintenance, general_fitness. Status:
active, paused, completed. Goal type defaults to weight_loss; it is a label and never
changes the formula. Target weight and deficit are required. `selected_deficit_kcal`
is the canonical field; `deficit_kcal` is accepted as an input alias. Current weight
may be omitted when a profile exists. Optional daily_steps_target is independent.
Manual nutrition targets are rejected; this replaces the earlier draft manual-target
contract. Outputs include all computed grams/kcal, current_weight_kg_snapshot,
calculation_method and calculation_version. See [formulas](nutrition-calculation.md).

PATCH input changes create a new goal UUID, preserving previous calculated values.
Status/label-only edits update the selected record. One active goal is enforced.
Updating profile current weight recalculates an active calculated goal as a new row;
unchanged profile weight does not override an explicit goal weight snapshot. Goal
inputs do not silently rewrite profile weight. Legacy rows remain readable; activation
requires supplying calculation inputs to create a validated revision. Input fields
cannot be null; daily_steps_target can be cleared.

Maintenance preview body: `{"current_weight_kg":97}`. Full preview uses the three
weights/deficit fields above. Responses label the calculation `is_estimate: true`.

```json
{"weight_kg":"70.250","recorded_at":"2026-01-01T08:00:00+05:30"}
```

`recorded_at` defaults to now; naive or future timestamps are rejected. The profile's
current weight is independently maintained by PUT profile; adding history does not
silently rewrite it.

## Food and meals

Custom food example, all nutrient values per 100 grams:

```json
{
  "name":"Example oats",
  "calories_kcal":"380",
  "protein_g":"13",
  "carbs_g":"67",
  "fat_g":"7",
  "fiber_g":null,
  "portions":[{"label":"scoop","grams":"30"}]
}
```

Nutrients are nullable, never defaulted to zero. Portion labels must be unique.
Meal body: meal_type (breakfast/lunch/dinner/snack), optional consumed_at (default now),
optional notes (max 2000), and 1–100 items. Each item supplies `food_id` and either
`quantity_g` or both `portion_id` and `portion_count`. These modes are exclusive.
The portion must belong to that food. Gram quantity must be positive and at most 100000.

`nutrient_snapshot = nutrient_per_100g * quantity_g / 100`, Decimal rounded to 0.001.
Meal responses include snapshot fields and totals. A PATCH with `items` replaces all
items and recalculates snapshots. A PATCH with only notes, consumed_at, or meal_type
does not recalculate them. Shared catalog updates never rewrite historical snapshots.

Daily responses contain date, timezone, totals, targets (null without an active goal),
and meals. A missing nutrient in any included item makes that nutrient total null.
Empty periods total zero. Day boundaries use the profile's IANA timezone or UTC.

Dashboard adds maintenance_calories, selected_deficit_kcal, daily_calorie_target,
calculation method/version, and calories/protein/carbs/fat/fiber budgets. Protein,
carbs and fat each include target/consumed/remaining grams and kcal. Fiber includes
grams only. Negative remaining values are retained. Unknown consumed nutrients or
missing targets yield null remaining values. Daily and dashboard share aggregation.
Historical dates use stored meal snapshots and the goal transition timeline described below.

## Errors

401 missing/invalid JWT; 403 forbidden HTTP exceptions use the standard envelope;
404 missing or foreign resource; 409 database constraint conflict; 422 validation;
503 missing/unavailable database/provider; generic 500 unexpected errors.

```json
{"error":{"code":"RESOURCE_NOT_FOUND","message":"Meal was not found","details":null}}
```

`X-Request-ID` accompanies responses for server log correlation. CORS does not expose
it to browser JavaScript by default. Health/db is operational and unauthenticated;
limit its network exposure at deployment if required.


## Historical target policy (migration 0003)

Daily and dashboard choose the last goal transition strictly before the end of the
requested day in the profile's IANA timezone. The last same-day activation or pause
wins for that whole day. A change exactly at the following midnight belongs to the
following day. Calendar boundaries support 23/25-hour DST days. No transition or a
pause transition means targets and remaining values are null, while consumed totals
remain available. Current goal status is not used to rewrite past validity.

Activations, replacements, pauses and completions append transitions under the user
lock. Intervals are implicitly half-open until the next transition; unique per-user
timestamps prevent ties. Nutrient snapshots remain unchanged. Reactivation appends a
new period. Referenced goals cannot be deleted. There is no backdating/deletion API.

Pre-0003 status changes were not logged. Migration preserves all old snapshots and
records only the current active state at migration time. Earlier target validity is
unknown and returned as null; created_at alone cannot prove an activation date.
Changing profile timezone reinterprets local calendar-day boundaries for past meals.

## Weight measurement, preview and confirmation

POST /weight-logs is measurement-only. It never changes the profile or any goal.
To reuse a logged weight with the active goal's target weight and deficit:

1. POST /weight-logs/{weight_id}/goal-preview (authenticated, no body). Returns full
   calculated targets plus base_goal_id and weight_log_id; no records are changed.
2. POST /weight-logs/{weight_id}/apply-goal with
   `{"expected_goal_id":"UUID_FROM_PREVIEW"}`. Returns201 with a new GoalOut UUID.
   The prior goal is preserved and its historical period remains available.
3. If the active goal changed since preview, confirmation returns409 GOAL_CHANGED.
   Preview again; do not silently confirm against different inputs.

Foreign/missing weight IDs return404. Without a calculated active goal, return422
CALCULATION_INPUTS_REQUIRED. Existing POST/PATCH goals remain available. PUT profile
with a changed current weight remains an explicit recalculation request under the
existing contract; a measurement alone never calls it.

## User-created recipes

POST /recipes requires authentication and creates an immutable recipe plus a private
food. GET /recipes/{recipe_id} returns only the owner's recipe (foreign IDs return404).

```json
{
  "name": "My measured recipe",
  "yield_g": "500",
  "aliases": ["my lunch"],
  "ingredients": [
    {"food_id": "INGREDIENT_FOOD_UUID", "quantity_g": "200"},
    {"food_id": "OIL_FOOD_UUID", "quantity_g": "10"}
  ],
  "portions": [{"label": "measured bowl", "grams": "125"}]
}
```

Supply actual final yield, not the sum of raw weights. Ingredients must be visible to
this user; repeat ingredient IDs must be combined. Response includes id, food, yield_g,
incomplete, ingredient quantities/nutrient snapshots and created_at. The nested food
has food_kind=recipe and a UUID/portions usable directly by POST /meals. Missing any
ingredient nutrient makes that recipe nutrient null and incomplete=true. Unknowns are
not zero. Include cooking oil/ghee explicitly; the service does not infer ingredients.
Create a new recipe for changes; ingredient/catalog changes never recalculate old ones.

Custom foods now accept aliases and food_kind=unspecified/ingredient/prepared_dish.
Curated matches rank first, then custom foods/recipes, then external catalog matches.
Food output includes food_kind and verified_at (curated operator attestation only).
Source IDs, source URLs, licenses and known portion grams remain available.

## Food provider resilience

Search still returns safe machine categories in provider_status, never remote bodies.
OFF uses up to3 attempts with6/12-second exponential backoff plus jitter for429,5xx,
network failures and timeouts. Long Retry-After values defer later requests instead of
blocking a request indefinitely. Other4xx/redirect errors are not retried. Successful
cached query results may be reused for up to FOOD_PROVIDER_STALE_SECONDS after expiry
(default3600), labeled cached. Persisted catalog rows remain searchable separately.
Failures do not prevent local/USDA results. Total provider failure with no local/stale
results returns a generic503. No barcode API was added.
