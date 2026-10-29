# Phase 5 initial mobile inventory

28 October 2026. Branch `codex/first-party-auth`; starting commit
`ac659910cf1855ae1ee652e0ff8eba445537e3a6`. Working tree was clean.
This source/test inventory precedes implementation; rendered and device acceptance
are separate checks. The deployed API is older than the frozen local backend.

| Existing screen / route | Existing integration | Missing interaction or contract | Existing coverage |
| --- | --- | --- | --- |
| Welcome/login/register/recovery/action routes under `(auth)` | Actual first-party endpoints, explicit token confirmation, generic202, password confirmation, resend cooldown | Registration email handoff, stronger form/busy guards and polished field/action states | auth-session, auth-outbox, flow, native-intent tests |
| Index / setup routing | `/me`, profile and paginated goals scan | Replace setup inference with authoritative `/onboarding`, bounded restore/error UI | onboarding and session-gate tests |
| Onboarding wizard | Server maintenance/macro preview, profile/goal writes and pending-goal reconciliation | DOB, units, timezone, all goal types, review/confirm, stable retry identity and final server state check | onboarding/flow tests |
| Dashboard tab | Actual `/dashboard/today` | Clear calorie/macro hierarchy, actual active workout resume, quick-action routes, day/app-resume refresh and shared invalidation | flow and fitness-contracts tests |
| Nutrition tab + `/food-search` | Read-only daily summaries and basic search | Food detail/server quantity/portions, debounced source paging, complete meal CRUD/history, custom foods, recipes, barcode camera/manual fallback | foundation flow tests only |
| Workouts tab | Read-only plans/catalog/history and unplanned start | Plan/schedule/exercise CRUD, active session restore, real set editing/completion/cancellation and history/records navigation | foundation start/reconciliation tests only |
| Tracking tab | Read-only unified summary | Weight/water/activity/sleep CRUD, targets/history, goal preview/apply, native Health Connect assessment | foundation contract tests only |
| Progress tab | Read-only seven-day values | Actual interactive history charts, seven/thirty/custom ranges, macros and tracking/workout analytics | foundation flow tests only |
| Profile tab + `/account` | Profile/goal read, real password/session/logout APIs | Profile replacement editor, preferences, goal history/revisions, confirmations, session validators and double-submit latches | session/controller tests; limited screen tests |
| Shared UI/theme | Nine light/dark colors, four spacing aliases, basic Page/Card/Field/native Action | Full semantic typography/spacing/line icons, dense hierarchy, skeleton/empty/error/confirmation/media/chart components | component tests indirectly |
| Shared API/session | Generated types, bounded requests, one-GET refresh, SecureStore rotation/generation/serialization, optional retry header | Account-scoped server-state cache, mutation invalidation, retained create identity, profile-zone/decimal helpers, runtime validation per feature | extensive API/auth tests |
| Six tabs and legacy links | Expo Router groups, root/action redirects, protected screens | Compact readable icons, registered nested feature stacks, no dead foundation links | route/intent tests; physical back behavior unverified |
| Media/assets | Existing application icons only | Licensed font inventory, optional valid exercise media, truthful missing-food-photo fallback | No rendered image coverage |
| Native integrations | Existing Expo SDK58 / @expo/ui / dev-client | Camera dependency and permissions; Health Connect compatibility, build and device evidence | Existing Doctor/prebuild/export are historical |
| Real local integration | Backend424-case baseline, mobile142-case baseline | Exercise actual JS API/session client against local FastAPI with disposable PostgreSQL and explicitly controlled test delivery | No complete frontend Phase5 flow yet |

No production fixtures or fabricated food/fitness history are required. Recipes are
immutable; food contracts have no image field. Unsupported erasure/sync settings must
be explained, not represented by dead buttons. Preserve all existing token/session
security and backend contracts/migrations/data.

## Execution and ownership

Four active native agents are available including the coordinator. Initial audit:
A design, B auth/profile and C nutrition. A establishes the shared component contract
before feature implementation. Later waves cover D workouts, E tracking/Health Connect,
F dashboard/progress/integration and G independent QA. The coordinator owns dependencies,
root navigation, cache/mutation/date utilities, real local integration and final checks.
Specialists own separate feature folders/routes. No simultaneous shared lock/config edits.

## Design contract

Warm neutral surfaces, charcoal text and one forest-green accent; coherent light/dark
tokens; Inter with preserved OFL notices; one line-icon family. Spacing4/8/12/16/20/24/32/40,
restrained8/12/16 corner radii, comfortable touch targets and scalable text. Existing
component exports remain compatible while richer components are introduced. No random
gradients, emojis, decorative art, fake photos, invented values or unactionable controls.

## Safety gates

Local source/dependencies/builds/tests/disposable databases and verified local commits
are authorized. No publication, live migration/configuration/deployment/email activation,
EAS cloud build, signing change, phone reset/uninstall, legacy deletion or paid resource.
Use `python -m uv run --no-sync` for backend execution; preserve Python3.12.15 and the
SQLAlchemy2.1.6 source build. Real-device/email/Health Connect acceptance cannot be
inferred from TypeScript, screenshots or mocked tests.
