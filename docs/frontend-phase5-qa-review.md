# Phase 5 independent QA review

29 October 2026. Review of the saved Phase 5 frontend changes, independently of
the feature authors. This is a source and regression review; rendered Android
acceptance is a separate, unverified gate.

## Scope and evidence

Reviewed nutrition search/detail/quantity/meal/custom-food/recipe/barcode flows;
exercise, plan, session/set and history flows; manual weight, water, activity and
sleep flows; Health Connect readiness; protected navigation; shared native
components; API caching, invalidation and mutation handling; and dashboard/progress
integration. The generated DTOs and frozen backend sources were used as references.

The review used the `code-review-and-quality` skill and inspected correctness,
readability, architecture, security and performance. No browser/device acceptance
is inferred from these checks.

Independent targeted run:

```powershell
# apps/mobile
npx --no-install jest src/screens/workouts/data.test.ts src/screens/workouts/workflows.test.tsx src/screens/tracking/data.test.ts src/screens/nutrition/forms.test.ts --runInBand --silent
npx --no-install eslint src/screens/workouts src/screens/tracking src/screens/nutrition src/components/design src/components/observed-chart.tsx
```

Result: **57 tests passed across four suites**; scoped ESLint exited 0 without
warnings. These are unit/component tests with mocked HTTP/native boundaries,
not the real local PostgreSQL integration layer. The coordinator's final complete
suite, TypeScript, Expo/native checks and real HTTP evidence belong in the final
test report.

After the assigned fixes, the four directly affected suites were run together:

```powershell
npx --no-install jest src/hooks/use-resource.test.tsx src/screens/nutrition/screens.test.tsx src/components/observed-chart.test.tsx src/screens/workouts/workflows.test.tsx --runInBand --silent
```

Result: **33/33 tests passed across four suites**. The two new resource tests were
first observed failing against the earlier implementation. The final assigned-file
ESLint run and whole-app `npm run typecheck` both exited 0. These 33 cases overlap
the earlier focused run; do not add their counts together as distinct tests.

## Findings already addressed in the saved source

- Workout plan/custom-exercise/set/notes forms now use a local removal guard.
  Header/hardware Back and closing a dirty inline set editor require a decision.
  Pending or uncertain writes keep their mounted retry identity until resolved.
  The current guard uses `pending || uncertain`; four saved regressions cover
  dirty Back, uncertain create, inline editor close and notes edited after a save.
- An in-flight read cannot repopulate the cache after its invalidation epoch.
  Account/session generation guards, provider remount and cache clearing remain.
- Actual backend business codes such as `ACTIVE_WORKOUT_EXISTS`, `GOAL_CHANGED`
  and `WEIGHT_CHANGED` remain available after safe error-code normalization.
- Timestamp input accepts the backend's microsecond precision while retaining
  explicit-offset and calendar validation.
- General progress series now use a horizontal FlatList with bounded initial and
  batch rendering, replacing thousands of eagerly created pressable chart columns.
- Signed observed weight change honors kg/lb preference without changing stored
  canonical measurements or server formulas.

## Follow-up findings and disposition

These are specific source findings, not a blanket approval. Their disposition must
be checked against the final source and test report before marking the whole
frontend locally complete.

1. **Fixed and regression-tested:** `useResource` changing the load callback for a date/filter/range did not change
   its numeric revision. The prior result could therefore report `loading=false`
   and retain an old error during a new request. Track the load identity/request
   version as well as revision, while retaining data explicitly as stale. The result
   now records its load identity; two new regressions failed before the fix and
   passed afterward. All three resource tests pass.
2. **Fixed and regression-tested:** Nutrition default-quantity food logging had no dirty flag during
   its initial pending save. Pending saves need removal protection even when no
   default input was changed. Meal/recipe ingredient-picker branches also need
   to render their active guard dialog; otherwise Back can be prevented invisibly.
   All nutrition create/edit callers now supply pending state; pending and uncertain
   saves cannot be discarded, and both picker branches render the dialog. Three
   additional cases verify these behaviors, with 14 nutrition screen tests passing.
3. **Fixed by the coordinator; source and tests reviewed:** Dashboard now shows the
   actual active session, active plan and relevant weekday, with a real planned-day
   start or saved-session resume action. The new weight context shows the active
   goal reference and up to 60 actual measurements within 30 profile-zone days.
   Preferred units apply, and source copy identifies the bounded history slice.
   The insight regression verifies the actual resumed UUID and converted measured
   weight/target instead of assuming a generic workout link is sufficient.
4. **Fixed by the coordinator; source and tests reviewed:** Progress now displays
   the server's calorie adherence ratio as well as consumed/target calories and
   all four macro adherence series. Decimal guards reject non-finite strings.
   Insight regressions check a 110% server ratio, an actual 30-day query and invalid
   adherence payloads. Historical targets remain server-owned.
5. **Fixed and regression-tested:** The backend bounds analytics record streams at 10,000 records,
   not one record per day. The expanded accessible chart table and workout history
   summaries must remain bounded. Accessible chart values now paginate 20 per page;
   workout progress paginates sessions and personal records 20 per page, resolves
   only visible exercise names and previews at most 10 sets per summary, with a link
   to the full saved session. New regressions verify page bounds, last pages and
   bounded name requests. Chart tests pass 3/3; workout workflow tests pass 13/13.

6. **Fixed by the coordinator; source and tests reviewed:** A present
   `goal.target_weight_kg` now passes a nullable, positive, finite decimal-string
   check bounded at 1,000 kg before rendering or lb conversion. Missing/null goal
   data still degrades safely. Regressions reject malformed strings and wrong
   decimal representation rather than allowing a render-time conversion error.

## Real PostgreSQL serialization follow-up

The actual local HTTP integration uncovered a case ordinary component fixtures had
missed: PostgreSQL NUMERIC zero may serialize as `0E-8`. Strict plain-decimal-only
response validators must not reject that valid representation. The coordinator
extracted the analytics validator into a pure module so the actual JavaScript
integration can use it, and added finite exponent-string support. Nutrition/profile
validator fixes and their regression evidence are recorded by the integration owner.

Reviewed `decimalText` and display changes: exponent strings expand with string
operations, without binary floating-point conversion of the value; tiny recorded
amounts are preserved, zero remains zero, and expansion is bounded to prevent an
unbounded allocation. The kg/lb helper consumes the expanded canonical value;
strict user-entered decimal validation remains strict. Goal editing normalizes its
initial zero-deficit representation. These changes preserve server calculations
and historical values, rather than introducing a new nutrient formula.

Independent final follow-up run:

```powershell
npx --no-install jest src/lib/form-values.test.ts src/lib/fitness-contracts.test.ts src/screens/insights.test.tsx --runInBand --silent
```

Result: **31/31 tests passed across three suites**, including exact tiny-decimal
display, malformed dashboard targets, actual active-workout navigation and
PostgreSQL zero-exponent analytics. Counts overlap other runs; use the coordinator's
complete collection for the distinct total. The six source findings above are
closed. No further frontend-breaking defect was identified in this focused final
review. The final real HTTP/backend, native and visual gates remain separately
reported; this statement is not production or device acceptance.

## Security and contract assessment

No release feature imports test fixtures or supplies fabricated fitness records.
Nutrition uses server calculations and preserves meal snapshots for metadata-only
edits. Profile and measurements remain separate from historical goals. Weight-to-goal
confirmation includes both the previewed goal UUID and measured weight, and stale
responses require a new preview. Activity replaces a complete day and preserves
unknown optional values. Sleep shows only supplied stages and actual elapsed time.

Receipt-supported creates retain the exact constructed body and UUID while mounted;
unkeyed set requests reconcile against the saved session. No generic automatic write
retry or cross-account queue was added. Ordinary drafts are not a crash-persistent
offline queue; that limitation must remain explicit. The existing secure session
controller was not rewritten by these feature changes.

Diagnostics retain sanitized categories, HTTP status and request IDs. No credentials,
JWTs or real health logs were observed in added release logging. `git diff --name-only`
showed no changes to backend source, generated API contracts, the auth-session
controller or EAS configuration at this review point. The dependency advisory count
reported by the coordinator remains a release risk; lint passing does not resolve it.

## Native and visual gates

Health Connect is truthfully disabled: no native module, no inferred device
availability, no permission request/read/upload and no invented successful sync.
Actual SDK/native compilation and Samsung A35 verification remain required before
enabling it. Camera/manual fallback source exists; actual camera scanning is not
verified by component tests.

**Rendered visual review: NOT EXECUTED successfully.** The preceding visual attempt
was ended by the computer-use safety check because the current browser URL could
not be confidently established. No acceptable screenshot was produced. This review
did not retry through another browser/control path. Light/dark rendering, 320/360 dp
layout, large Android fonts, keyboard behavior and TalkBack remain device/rendering
checks; source inspection and contrast assertions do not substitute for them.

No deployment, EAS build, live migration, email activation, signing change or phone
data action was performed by this reviewer. No user browser was closed or modified.
