# Phase 7 Samsung Galaxy A35 5G acceptance

30 October2026. **NOT TESTED.** No phone installation, uninstall, data clearance,
permission change or sensor read was performed. This is an unexecuted acceptance
checklist. Toolchain and existing APK evidence are in
`phase7-android-auth-acceptance.md`.

## Required entry conditions

Record the approved source commit, actual EAS build ID, APK hash/versionCode,
package/signing certificate, installed version, Samsung model, Android/security
patch version, backend revision/schema and timestamp/timezone. Obtain the actual
incident build identity before attributing the29October error to the available old
Clerk-era APK. Use an approved dedicated test account/inbox; keep passwords, tokens,
action-link queries and personal health data out of screenshots and logs.

Before testing, confirm matching first-party backend deployment and incremental
schema, real sender permissions, worker/intake activation and actual inbox delivery.
Deployment, live migration, provider changes, EAS cloud build and phone installation
require their separate explicit approvals. An approved compatible update must keep
`com.provia.app` and its existing signing identity. Do not install a debug-signed
binary over the EAS preview or erase data to resolve mismatch.

## Authentication gate — execute in order after prerequisites

Every row currently remains **NOT EXECUTED**; record observed status/error/requestID
and minimal redacted screenshot evidence after actual execution.

| ID | Action and acceptance |
| --- | --- |
| A01 | Launch approved installation cold; finite loading, correct public UI, no unmatched root |
| A02 | Register dedicated account through UI; valid/invalid/missing/mismatch values and double-submit protection; generic accepted state |
| A03 | Observe actual verification inbox arrival; open real cold/warm link, explicit confirmation succeeds; expired/reused links recover safely |
| A04 | Login through UI; invalid credentials and unverified account render appropriate errors; valid verified account proceeds |
| A05 | Complete real onboarding/server maintenance preview/deficit/macros/goal; protected dashboard displays actual saved data |
| A06 | Close/reopen process, background/foreground and lock/unlock; native SecureStore restore succeeds without connecting loop |
| A07 | Access expiry refreshes safely; offline launch/network recovery terminate loading; unknown rotation fails closed without token replay |
| A08 | Real password-reset inbox and cold/warm link work; old sessions revoked, new password login succeeds |
| A09 | Header/hardware/predictive Back preserve dirty drafts; pending saves cannot silently disappear |
| A10 | Logout denies protected content; login again; switch dedicated accounts and confirm no prior cache/draft/health data |

Only after all required authentication conditions are evidenced may Health Connect
implementation begin. The current build does not include a native Health Connect
adapter. The following is a future checklist, not a claim of integrated functionality.

## Future native Health Connect acceptance

| ID | Required actual observation | Current result |
| --- | --- | --- |
| H01 | New approved native build includes compatible SDK; provider availability correctly detected | BLOCKED |
| H02 | Explain/request only supported read permissions; actual platform UI handles denied/partial/revoked grants | BLOCKED |
| H03 | Confirm participating provider writes records to Health Connect; absent data reported NO DATA | BLOCKED |
| H04 | Read actual aggregated local-day steps without overlapping phone/watch double-count | BLOCKED |
| H05 | Explicit manual sync persists authoritative activity snapshot; known manual data requires conflict review | BLOCKED |
| H06 | Read actual weight/sleep intervals and supported stages; stable external IDs replay without duplicates | BLOCKED |
| H07 | Confirm saved server values and refresh dashboard/tracking/progress; restart retains saved values | BLOCKED |
| H08 | Repeat sync, uncertain upload, overlap/source conflict, time-zone/DST/history limits handled safely | BLOCKED |
| H09 | Revoke permission/logout/account switch cancels reads/uploads; no cached health upload under another account | BLOCKED |
| H10 | App termination/deletion reconciliation cannot recreate intentionally removed records silently | BLOCKED |

Controlled injected records, if later authorized, must be labeled synthetic test
data; they cannot establish genuine sensor acceptance. Permission/read failure is
unknown, never a zero upload. Samsung Health presence alone does not prove it shares
data through Health Connect. Do not enable background health access or alter nutrition
targets/profile weight based on imported activity/measurements.
