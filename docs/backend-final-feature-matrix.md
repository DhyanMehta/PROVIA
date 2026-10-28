# Backend final feature matrix — Phase 4

Initial source/test inventory: 28 October 2026, branch `codex/first-party-auth`,
starting commit `0571f603fc64f84a92c948ef3696db326683c8cc`. This inventory was recorded
before implementation. Route existence alone is not a completion result. Final
verification and consumption contracts will be recorded below as work completes.

| Feature | Existing endpoint | Initial status | Confirmed missing behavior | Existing tests | Frontend contract | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| First-party auth and encrypted mail | `/auth/*` | COMPLETE code; BLOCKED BY EXTERNAL SERVICE acceptance | Real sender/key configuration, inbox and deployed acceptance | first_party_security, first_party_auth, auth_outbox, managed_auth_delivery | Generic async acceptance, verified sessions, rotating refresh | P0 external |
| Profile and goals | `/profile`, `/goals`, weight goal preview/apply | COMPLETE core | Historical step-target changes need revision protection | profiles, targets, postgres | Metric inputs, immutable goal revisions, current zone | P1 |
| Onboarding | `/auth/me`, `/profile`, `/goals` | PARTIAL | Derived state and direct active-goal retrieval | profiles, auth integrations | One derived next step; no stored contradictory flags | P1 |
| Formula calculation | `/nutrition/calculate-*` | COMPLETE | No formula change required | targets, nutrition, postgres | Weight ×24, specified macro formulas, validation, decimals | P0 preserve |
| Food search/providers | `/foods/search`, `/foods/{id}` | PARTIAL | Pagination, provider-source filtering, barcode lookup | nutrition, indian_catalog, hardening | Provider provenance, nullable nutrients, safe failures | P1 |
| Indian catalog | attributed importer, custom foods/recipes | BLOCKED BY EXTERNAL SERVICE | Verified legally reusable dataset unavailable | indian_catalog | Explicit manual/custom fallback; never invent values | P1 external |
| Recipes | POST `/recipes`, GET `/recipes/{id}` | PARTIAL | Own paginated collection missing | hardening, postgres | Immutable yield/ingredient snapshots | P2 |
| Meal CRUD/snapshots | `/meals`, `/nutrition/daily`, `/nutrition/dashboard` | PARTIAL | Retry-safe creation; range retrieval | nutrition, postgres | Stable IDs, historical snapshots, local days, nullable totals | P1 |
| Exercise catalog/plans | `/exercises`, `/workout-plans` | COMPLETE core | No duplicate implementation needed | day2_validation, integration/day2 | Filters, schedule replacement/order, archived references | P1 preserve |
| Workout lifecycle | `/workout-sessions`, nested `/sets` | PARTIAL | Active/status lookup, duplicate-start protection, retry safety | integration/day2, day3 | Positive elapsed duration, valid sets; duration-only supported | P1 |
| Weight | `/weight-logs` | PARTIAL | Correct/delete, dated history/latest, provenance, retry safety | profiles, postgres | Measurement separate from explicit goal recalculation | P1 |
| Water | `/water-logs`, `/water/target`, `/water/dashboard` | PARTIAL | Retry-safe creation | integration/day2 | Metric ml, effective targets, local-day totals | P1 |
| Activity | `/activity/daily`, `/activity/summary` | COMPLETE core | Paginated raw range and explicit owned deletion | integration/day2, day3 | Complete-day replacement; source/stale conflicts | P2 |
| Sleep | `/sleep-sessions`, `/sleep/summary` | COMPLETE core | Optional manual-create retry identity | integration/day2, day3 | Offset instants, elapsed duration, wake-date grouping | P2 |
| Dashboard and analytics | `/dashboard/today`, `/progress/overview`, `/workouts/*` | PARTIAL | Macro adherence and target-weight context; explicit handoff | integration/day2, day3 | Bounded ranges, missing measurements remain null | P1 |
| Health Connect server contract | activity snapshot + sleep import IDs | PARTIAL | Weight provenance/import replay | integration/day3 | Authoritative client reconciliation; no Android integration claim | P1 |
| Contracts/release package | OpenAPI and generated TS | PARTIAL | Phase 4 inventory/handoff and final schema regeneration | day3_contracts, contract typecheck | Frozen verified contracts after all changes | P0 |
| Native Health Connect/AI | None in backend scope | DEFERRED TO PHASE 2 | Android native integration and AI explicitly excluded | Not executed | Future Android phase | Deferred |

Database inventory: 27 SQLAlchemy tables at migration `0006`. Migrations `0005` and
`0006` are preserved. Application database remains at `0004`; only disposable tests
may migrate during this phase. Existing nutrition/goal/session history is retained.

Security review boundary: authenticated internal user UUIDs, untrusted mobile input,
external provider JSON and mail payloads. Preserve account/session validation,
row ownership, generic enrollment responses and encrypted worker semantics. New
retry keys must be scoped by user and operation, reject changed payloads and never
recreate a deleted resource from an old queued request.

## Final contract and verification map

The final source contains the following verified consumption paths. All424 backend
cases passed, including76 real PostgreSQL cases; see the complete freeze decision in
[backend-final-test-report.md](backend-final-test-report.md). COMPLETE means locally
implemented, tested and documented, not external service or device acceptance. The
original inventory above remains unchanged so confirmed initial gaps stay visible.

| Feature | Final status | Final endpoint / behavior | Verification coverage | Frontend contract |
| --- | --- | --- | --- | --- |
| Account/session lifecycle | COMPLETE | Existing `/auth/*`; generic durable acceptance, verified ownership, rotation/revocation retained | first_party_security, first_party_auth, auth_outbox, managed_auth_delivery | [Authentication](frontend-api-handoff.md#a-authentication) |
| Profile/onboarding | COMPLETE | `/profile`; new `/onboarding` derives flags/current profile/active goal and next step, including pending verification | phase4_profiles_unit; PG phase4_profiles | [Onboarding](frontend-api-handoff.md#b-onboarding-and-goals) |
| Goals and formulas | COMPLETE | Existing calculation and goal routes; inputs/type/steps changes preserve revisions; stale weight confirmation now409 | targets, profiles, phase4_profiles_unit; PG core/phase4_profiles | Echo goal ID and expected measurement; never recalculate in UI |
| Food search/details | COMPLETE | Existing search now source-filtered/per-source paginated; barcode and quantity-preview paths added | phase4_nutrition, provider_boundaries; PG phase4_nutrition_pg | [Nutrition](frontend-api-handoff.md#c-foods-recipes-and-meal-tracking) |
| Custom foods/recipes | COMPLETE | Existing create/detail plus paginated own recipes; immutable ingredients/yield; nullable nutrients; retry keys | hardening/nutrition; PG recipe/retry coverage | Explicit measured/manual fallback for missing catalog data |
| Meal lifecycle/history | COMPLETE | Existing CRUD/snapshots; date or inclusive bounded range; optional owner/operation retry key | nutrition/targets; PG core and phase4_nutrition_pg, concurrent replay | Singular snack, metric grams, replace items explicitly |
| Daily totals/remaining | COMPLETE | Existing daily/dashboard; historical targets and unknown propagation; reject>100 meals rather than truncate | nutrition, targets, phase4_provider_boundaries; PG bounds and core | Paginated history remains available for exceptional days |
| Exercise catalog/plans | COMPLETE | Existing filtered catalog/custom/archive and nested plan schedule; retry-safe create/duplicate | day2_validation; PG day2 and phase4_create_retries | Nested schedule replacement implements add/remove/order |
| Session/set lifecycle | COMPLETE | New active lookup/status filter; one active new start; positive duration; existing set edits/deletes/history/records | phase4_fitness_unit; PG day2/day3/phase4_fitness | Duration-only sessions valid; legacy active duplicates retained |
| Body weight | COMPLETE | New detail/latest/PATCH/DELETE/ranges/source IDs; optional retry protection; no silent goal/profile update | phase4_profiles_unit; PG phase4_profiles | [Tracking](frontend-api-handoff.md#e-weight-water-activity-and-sleep) |
| Water | COMPLETE | Existing CRUD/dated target/daily totals plus retry-safe POST | day2_validation; PG day2/phase4_fitness/day3 commit rollback | ml; no assumed target; remaining floors at0 |
| Activity | COMPLETE | Existing canonical snapshot/summary plus paginated range and repeat-safe owned deletion | day2_validation; PG day2/day3/phase4_fitness | Known0 differs from unknown; stale/source conflicts409 |
| Sleep | COMPLETE | Existing own CRUD, offset intervals/stages/import replay; optional create retry key | day2_validation; PG day2/day3/phase4_fitness | Wake-day grouping, elapsed duration, no overlap |
| Dashboard/progress | COMPLETE | Same endpoints; historical goal context and protein/carbs/fat/fiber budgets/adherence | phase4_insights_unit; PG day2/phase4_insights | [Dashboard](frontend-api-handoff.md#f-unified-dashboard-and-analytics) |
| Retry and errors | COMPLETE | Twelve optional-key operations; atomic receipt/resource, changed/deleted replay409, safe errors/request IDs | idempotency_unit, phase4_contracts; PG concurrent/rollback cases; mobile wrapper tests | [Transport](frontend-api-handoff.md#h-mobile-transport-and-retry-rules) |
| Source/sync readiness | COMPLETE | Existing activity/sleep plus weight provenance/import identity; documented authoritative-client reconciliation | PG day3/phase4_profiles/phase4_fitness | [Health Connect](health-connect-integration.md); native integration not implemented |
| Contract handoff | COMPLETE | 67 paths/91 operations; generated OpenAPI/TS/inventory; runtime validation remains client responsibility | day3_contracts, phase4_contracts, generated checks/typecheck | Full [feature-to-endpoint map](frontend-api-handoff.md#feature-to-endpoint-consumption-matrix) |

## Explicit unresolved scope

| Requirement | Status | Resolution boundary |
| --- | --- | --- |
| Verified Indian food catalog coverage | BLOCKED BY EXTERNAL SERVICE | Approved legally reusable, verified data still unavailable; manual/custom/recipe workflow works |
| Real email/sender and key custody | BLOCKED BY EXTERNAL SERVICE | Actual provider/account configuration and inbox acceptance required; no verification bypass |
| Existing application rollout | BLOCKED BY EXTERNAL SERVICE | Separate backup/migration/deployment/activation approval; current DB0004 preserved |
| Reliable always-on free mail | BLOCKED BY EXTERNAL SERVICE | Render sleep/expiry and Neon allowance prevent an assumed SLA; no paid workaround |
| Legacy account enrollment | DEFERRED TO PHASE 2 | Separately approved proof-of-ownership workflow; no email-based linking or data deletion |
| Native Health Connect, Android acceptance, AI | DEFERRED TO PHASE 2 | Android/native integration and real-device acceptance are future work; AI excluded |
| Broad production launch | PARTIAL | Local contracts can freeze separately; see operational/dependency/retention/acceptance gates |
