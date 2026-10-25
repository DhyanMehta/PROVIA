# Sprint48 first-flow verification checklist

All real-account/device items below are NOT RUN in execution1. Automated tests use
fixtures and never qualify as real Clerk/Neon/device success. Use only an authorized
development account. Do not record tokens, passwords, OTPs or raw health data in logs.

| Scenario | Expected observation | Current evidence |
| --- | --- | --- |
| Fresh install | PROVIA launches; welcome when signed out | Native prebuild/bundle only; no APK |
| Signup/login | Clerk browser opens, callback returns to app, SDK active session | Hosted flow implemented; real session pending |
| API identity | Real bearer `/api/v1/me` succeeds and owned-resource access works | Mock transport tests; real backend unavailable |
| New account | Profile/weight/maintenance/deficit/macro preview/confirmation | Component test passes with server fixtures |
| Persistence | Actual Neon profile and goal present; dashboard matches | Real persistence BLOCKED; backend Python currently blocked |
| Returning account | Finds active goal even beyond first history page | Automated pagination regression |
| Invalid form | Invalid weights/height/name do not trigger preview/save | Automated validation/component tests |
| Network failure | Draft retained; no success navigation; safe error/request ID | Automated component/client tests |
| Ambiguous goal POST | Marker survives restart; no repost on absent/stale read; matching read resolves | Automated delayed-commit/persisted-store simulation |
| Cold backend | Loading guidance; bounded wait/cancellation; no duplicate mutation | Timeout tests; real Render cold-start check pending |
| Session expiry | GET refresh once via Clerk; invalid session requires login | Mock SDK/client tests; real expiration pending |
| Sign out | Protected screens removed, pending account requests cancelled | Provider guards tested; real device sign-out pending |
| App restart | SecureStore restores Clerk session; fetch current server state | SDK integration implemented; device restart pending |
| Goal update | Only explicit confirmation activates a new goal; historical snapshots remain | Client coordinator checks; real persistent update pending |
| No data | No fabricated food/water/step/sleep/workout values; unknown differs from0 | Dashboard component test |
| Cross-account | No draft/request/marker crosses authenticated account identity | Client guard tests; real two-account device check pending |

For a real pass: record date, device Android/Health Connect version, APK build ID/hash,
package/version, verified HTTPS backend and test outcome. Keep screenshots free of
private records. Reopen the app after process kill and device restart; these differ
from a React refresh. Test both profile-created/goal-failed and goal-created/response-
lost paths. Inspect saved records as the authorized operator without modifying them.

If a pending goal marker remains but no matching active goal is visible, the client
fails closed. Do not clear storage or reinstall just to retry a POST. An authorized
operator must establish the prior request's final outcome; true server idempotency
is remaining work. The marker contains minimal canonical goal inputs encrypted by
SecureStore, keyed by backend user UUID, never a bearer token. It is removed after
successful creation, positive matching reconciliation or definite client rejection;
it is retained across sign-out so account changes cannot erase uncertainty.

Health Connect real-device tests follow docs/health-connect-integration.md in execution2.
No Health Connect permissions or records were read by execution1.
