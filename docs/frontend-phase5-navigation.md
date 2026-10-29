# Phase 5 navigation

29 October 2026. Existing Expo Router application and Android identity are retained.

Six persistent destinations: Today (`/dashboard`), Nutrition (`/nutrition`), Workouts
(`/workouts`), Tracking (`/tracking`), Progress (`/progress`) and Profile (`/profile`).
The tab icons use one Lucide line-icon family. Nested feature stacks have native
headers, back navigation and protected root registration; they do not create duplicate
index routes beside the tab destinations.

| Area | Nested destinations |
| --- | --- |
| Nutrition | `/nutrition/search`, `/nutrition/food/[food_id]`, `/nutrition/meal/[meal_id]`, `/nutrition/history`, `/nutrition/custom-food`, `/nutrition/recipes`, `/nutrition/recipes/new`, `/nutrition/recipes/[recipe_id]`, `/nutrition/barcode` |
| Workouts | `/workouts/exercises`, `/workouts/exercises/new`, exercise detail/edit/history, `/workouts/plans`, `/workouts/plans/new`, plan detail/edit, `/workouts/active`, `/workouts/sessions`, session detail, `/workouts/progress` |
| Tracking | `/tracking/weight`, weight new/detail and separate weight-goal confirmation, `/tracking/water`, `/tracking/activity`, `/tracking/sleep`, sleep new/detail, `/tracking/health-connect` |
| Account | `/account`, `/onboarding`; profile edit and paged goal history/revision are within Profile |

Initial navigation uses authenticated `/me` and the authoritative `/onboarding`
response. A verified account does not imply completed profile/goal setup. Fitness
routes require a signed-in, verified account. Account security remains available
to signed-in accounts awaiting verification. Verification and reset links continue
to require explicit confirmation; action tokens are removed from route parameters.
`/food-search` redirects to the working nutrition search. Existing native intent
parsing and session initialization safeguards remain.

Dashboard quick actions enter food search, active-workout restoration/start, water
tracking and a new weight measurement. Nutrition actions carry the selected meal
category. Exercise and plan links carry actual backend UUIDs. Route IDs and incoming
parameters are checked before writes.

Dirty forms intercept header/hardware Back using SDK 58's `usePreventRemove`.
Failed saves retain mounted input. Pending/uncertain writes require reconciliation
before dismissal where the operation has no safe replay. Ordinary drafts are bounded
in memory, with an explicit discard confirmation; there is no background write queue.
Onboarding's account-scoped unresolved goal marker also survives restart.

Samsung hardware Back, Android predictive Back, keyboard and deep-link acceptance
remain separate device checks in `frontend-phase5-device-checklist.md`.
