# Backend endpoint inventory

Generated from the actual credential-free FastAPI schema; do not edit rows by hand.
Regenerate with `python -m uv run --no-sync python -m scripts.export_endpoint_inventory`;
use `--check` to reject drift. This is a local source contract, not a deployed-service claim.

**67 paths; 91 operations.** All paths include `/api/v1`.

Every non-204 operation returns JSON. Error responses use `ErrorEnvelope`; every response
has `X-Request-ID`. Decimal output values are strings with variable trailing zeros.
Units are kg, cm, g, ml, m, kcal and elapsed seconds; timestamps require explicit offsets.
`Page_*` responses use `items`, `limit`, `offset`; food search uses per-source `page`/
`page_size`. Date boundaries, sorting, lifecycle and retry semantics are specified in the
[frontend handoff](frontend-api-handoff.md), not inferred from HTTP method alone.

| Method | Path | Authorization | JSON request | Parameters | Success response |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/activity` | Verified session | — | start_date (query), end_date (query), limit (query), offset (query) | 200 Page_ActivityOut_ |
| DELETE | `/api/v1/activity/daily` | Verified session | — | date (query, required) | 204 no body |
| GET | `/api/v1/activity/daily` | Verified session | — | date (query, required) | 200 ActivityOut or null |
| PUT | `/api/v1/activity/daily` | Verified session | ActivityPut | — | 200 ActivityOut |
| GET | `/api/v1/activity/summary` | Verified session | — | start_date (query), end_date (query) | 200 ActivitySummary |
| POST | `/api/v1/auth/change-password` | Session (verification may be pending) | ChangeIn | — | 200 MessageOut |
| POST | `/api/v1/auth/forgot-password` | Public | EmailIn | — | 202 MessageOut |
| POST | `/api/v1/auth/login` | Public | LoginIn | — | 200 TokenOut |
| POST | `/api/v1/auth/logout` | Public | RefreshIn | — | 200 MessageOut |
| POST | `/api/v1/auth/logout-all` | Session (verification may be pending) | — | — | 200 MessageOut |
| GET | `/api/v1/auth/me` | Session (verification may be pending) | — | — | 200 AccountOut |
| POST | `/api/v1/auth/refresh` | Public | RefreshIn | — | 200 TokenOut |
| POST | `/api/v1/auth/register` | Public | RegisterIn | — | 202 MessageOut |
| POST | `/api/v1/auth/resend-verification` | Public | EmailIn | — | 202 MessageOut |
| POST | `/api/v1/auth/reset-password` | Public | ResetIn | — | 200 MessageOut |
| GET | `/api/v1/auth/sessions` | Session (verification may be pending) | — | — | 200 list[app__modules__auth__schemas__SessionOut] |
| DELETE | `/api/v1/auth/sessions/{session_id}` | Session (verification may be pending) | — | session_id (path, required) | 204 no body |
| POST | `/api/v1/auth/verify-email` | Public | ActionIn | — | 200 MessageOut |
| GET | `/api/v1/dashboard/today` | Verified session | — | date (query) | 200 DailyDashboard |
| GET | `/api/v1/exercises` | Verified session | — | q (query), muscle_group (query), equipment (query), category (query), limit (query), offset (query) | 200 Page_ExerciseOut_ |
| POST | `/api/v1/exercises/custom` | Verified session | ExerciseCreate | Idempotency-Key (header) | 201 ExerciseOut |
| DELETE | `/api/v1/exercises/custom/{exercise_id}` | Verified session | — | exercise_id (path, required) | 204 no body |
| PATCH | `/api/v1/exercises/custom/{exercise_id}` | Verified session | ExercisePatch | exercise_id (path, required) | 200 ExerciseOut |
| GET | `/api/v1/exercises/{exercise_id}` | Verified session | — | exercise_id (path, required) | 200 ExerciseOut |
| GET | `/api/v1/foods/barcode/{barcode}` | Verified session | — | barcode (path, required) | 200 FoodOut |
| POST | `/api/v1/foods/custom` | Verified session | FoodCreate | Idempotency-Key (header) | 201 FoodOut |
| GET | `/api/v1/foods/search` | Verified session | — | q (query, required), source (query), page (query), page_size (query) | 200 SearchOut |
| GET | `/api/v1/foods/{food_id}` | Verified session | — | food_id (path, required) | 200 FoodOut |
| GET | `/api/v1/foods/{food_id}/nutrition` | Verified session | — | food_id (path, required), quantity_g (query, required) | 200 FoodQuantityOut |
| GET | `/api/v1/goals` | Verified session | — | limit (query), offset (query) | 200 Page_GoalOut_ |
| POST | `/api/v1/goals` | Verified session | GoalCreate | Idempotency-Key (header) | 201 GoalOut |
| PATCH | `/api/v1/goals/{goal_id}` | Verified session | GoalPatch | goal_id (path, required) | 200 GoalOut |
| GET | `/api/v1/health` | Public | — | — | 200 HealthOut |
| GET | `/api/v1/health/db` | Public | — | — | 200 DatabaseHealthOut |
| GET | `/api/v1/health/ready` | Public | — | — | 200 ReadyOut |
| GET | `/api/v1/me` | Verified session | — | — | 200 UserOut |
| PATCH | `/api/v1/me` | Verified session | UserPatch | — | 200 UserOut |
| GET | `/api/v1/meals` | Verified session | — | date (query), limit (query), offset (query), start_date (query), end_date (query) | 200 Page_MealOut_ |
| POST | `/api/v1/meals` | Verified session | MealCreate | Idempotency-Key (header) | 201 MealOut |
| DELETE | `/api/v1/meals/{meal_id}` | Verified session | — | meal_id (path, required) | 204 no body |
| GET | `/api/v1/meals/{meal_id}` | Verified session | — | meal_id (path, required) | 200 MealOut |
| PATCH | `/api/v1/meals/{meal_id}` | Verified session | MealPatch | meal_id (path, required) | 200 MealOut |
| POST | `/api/v1/nutrition/calculate-goals` | Public | GoalCalculationInput | — | 200 GoalCalculationOut |
| POST | `/api/v1/nutrition/calculate-maintenance` | Public | MaintenanceInput | — | 200 MaintenanceOut |
| GET | `/api/v1/nutrition/daily` | Verified session | — | date (query, required) | 200 DailyOut |
| GET | `/api/v1/nutrition/dashboard` | Verified session | — | date (query, required) | 200 DashboardOut |
| GET | `/api/v1/onboarding` | Session (verification may be pending) | — | — | 200 OnboardingOut |
| GET | `/api/v1/profile` | Verified session | — | — | 200 ProfileOut |
| PUT | `/api/v1/profile` | Verified session | ProfilePut | — | 200 ProfileOut |
| GET | `/api/v1/progress/overview` | Verified session | — | start_date (query), end_date (query) | 200 ProgressOverview |
| GET | `/api/v1/recipes` | Verified session | — | limit (query), offset (query) | 200 Page_RecipeOut_ |
| POST | `/api/v1/recipes` | Verified session | RecipeCreate | Idempotency-Key (header) | 201 RecipeOut |
| GET | `/api/v1/recipes/{recipe_id}` | Verified session | — | recipe_id (path, required) | 200 RecipeOut |
| GET | `/api/v1/sleep-sessions` | Verified session | — | start_date (query), end_date (query), limit (query), offset (query) | 200 Page_SleepOut_ |
| POST | `/api/v1/sleep-sessions` | Verified session | SleepCreate | Idempotency-Key (header) | 201 SleepOut |
| DELETE | `/api/v1/sleep-sessions/{session_id}` | Verified session | — | session_id (path, required) | 204 no body |
| GET | `/api/v1/sleep-sessions/{session_id}` | Verified session | — | session_id (path, required) | 200 SleepOut |
| PATCH | `/api/v1/sleep-sessions/{session_id}` | Verified session | SleepPatch | session_id (path, required) | 200 SleepOut |
| GET | `/api/v1/sleep/summary` | Verified session | — | start_date (query), end_date (query) | 200 SleepSummary |
| GET | `/api/v1/water-logs` | Verified session | — | start_date (query), end_date (query), limit (query), offset (query) | 200 Page_WaterOut_ |
| POST | `/api/v1/water-logs` | Verified session | WaterCreate | Idempotency-Key (header) | 201 WaterOut |
| DELETE | `/api/v1/water-logs/{log_id}` | Verified session | — | log_id (path, required) | 204 no body |
| PATCH | `/api/v1/water-logs/{log_id}` | Verified session | WaterPatch | log_id (path, required) | 200 WaterOut |
| GET | `/api/v1/water/dashboard` | Verified session | — | date (query, required) | 200 WaterDashboard |
| PUT | `/api/v1/water/target` | Verified session | TargetPut | — | 200 TargetOut |
| GET | `/api/v1/weight-logs` | Verified session | — | limit (query), offset (query), start_date (query), end_date (query) | 200 Page_WeightOut_ |
| POST | `/api/v1/weight-logs` | Verified session | WeightCreate | Idempotency-Key (header) | 201 WeightOut |
| GET | `/api/v1/weight-logs/latest` | Verified session | — | — | 200 WeightOut |
| DELETE | `/api/v1/weight-logs/{weight_id}` | Verified session | — | weight_id (path, required) | 204 no body |
| GET | `/api/v1/weight-logs/{weight_id}` | Verified session | — | weight_id (path, required) | 200 WeightOut |
| PATCH | `/api/v1/weight-logs/{weight_id}` | Verified session | WeightPatch | weight_id (path, required) | 200 WeightOut |
| POST | `/api/v1/weight-logs/{weight_id}/apply-goal` | Verified session | WeightGoalConfirmation | weight_id (path, required), Idempotency-Key (header) | 201 GoalOut |
| POST | `/api/v1/weight-logs/{weight_id}/goal-preview` | Verified session | — | weight_id (path, required) | 200 WeightGoalPreview |
| GET | `/api/v1/workout-plans` | Verified session | — | limit (query), offset (query) | 200 Page_PlanOut_ |
| POST | `/api/v1/workout-plans` | Verified session | PlanCreate | Idempotency-Key (header) | 201 PlanOut |
| DELETE | `/api/v1/workout-plans/{plan_id}` | Verified session | — | plan_id (path, required) | 204 no body |
| GET | `/api/v1/workout-plans/{plan_id}` | Verified session | — | plan_id (path, required) | 200 PlanOut |
| PATCH | `/api/v1/workout-plans/{plan_id}` | Verified session | PlanPatch | plan_id (path, required) | 200 PlanOut |
| POST | `/api/v1/workout-plans/{plan_id}/duplicate` | Verified session | — | plan_id (path, required), Idempotency-Key (header) | 201 PlanOut |
| GET | `/api/v1/workout-sessions` | Verified session | — | start_date (query), end_date (query), status (query), limit (query), offset (query) | 200 Page_SessionOut_ |
| POST | `/api/v1/workout-sessions` | Verified session | SessionCreate | Idempotency-Key (header) | 201 app__modules__workouts__schemas__SessionOut |
| GET | `/api/v1/workout-sessions/active` | Verified session | — | — | 200 app__modules__workouts__schemas__SessionOut or null |
| GET | `/api/v1/workout-sessions/{session_id}` | Verified session | — | session_id (path, required) | 200 app__modules__workouts__schemas__SessionOut |
| PATCH | `/api/v1/workout-sessions/{session_id}` | Verified session | SessionPatch | session_id (path, required) | 200 app__modules__workouts__schemas__SessionOut |
| POST | `/api/v1/workout-sessions/{session_id}/complete` | Verified session | CompleteInput | session_id (path, required) | 200 app__modules__workouts__schemas__SessionOut |
| POST | `/api/v1/workout-sessions/{session_id}/sets` | Verified session | SetCreate | session_id (path, required) | 201 SetOut |
| DELETE | `/api/v1/workout-sessions/{session_id}/sets/{set_id}` | Verified session | — | session_id (path, required), set_id (path, required) | 204 no body |
| PATCH | `/api/v1/workout-sessions/{session_id}/sets/{set_id}` | Verified session | SetPatch | session_id (path, required), set_id (path, required) | 200 SetOut |
| GET | `/api/v1/workouts/exercises/{exercise_id}/history` | Verified session | — | exercise_id (path, required), start_date (query), end_date (query) | 200 WorkoutSummary |
| GET | `/api/v1/workouts/progress` | Verified session | — | start_date (query), end_date (query) | 200 WorkoutSummary |
| GET | `/api/v1/workouts/summary` | Verified session | — | start_date (query), end_date (query) | 200 WorkoutSummary |
