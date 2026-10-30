# Phase 6 Samsung Galaxy A35 5G acceptance plan

30 October 2026. **NOT VERIFIED.** These are instructions for an approved future
installation/acceptance session; no phone data was changed in Phase6.

## Entry conditions and evidence

Use the reviewed Phase6 commit and a matching approved backend at migration0007.
The currently hosted older API does not qualify. Real Resend sender/provider/worker
delivery must be enabled and verified separately. Use dedicated acceptance accounts,
explicitly measured test records, and no existing user-data deletion.

Record commit, EAS build ID/APK SHA256, package `com.provia.app`, signing certificate
fingerprint, versionCode, public API revision, device Android/security-patch version,
test timestamp/timezone, display/font settings and outcome for each case. Keep evidence
free of tokens, email links, passwords, real health details and other account identities.
Attach redacted screenshots for visual cases only; logs should contain status, safe
error category and request ID. A screenshot of a screen is not proof its write succeeded.

Review APK signature against the currently installed app before attempting replacement.
With authorized adb and the chosen APK, the intended non-erasing operation is:

```powershell
adb devices
adb install -r 'C:\path\to\approved-provia-preview.apk'
```

Select the intended device if more than one is connected. Do not execute these commands
until installation is approved. Stop on signature/version incompatibility; do not
uninstall, clear data, reset the phone, force a downgrade or replace signing keys.
A local debug APK normally differs from the existing EAS signing identity and must
not be assumed suitable for in-place replacement. Preserve owner `dhyan_mehta`, EAS
project `4e131be3-7394-4883-ae44-498c63bfcac5` and scheme `provia`.

## Ordered acceptance

| Case | Action and required result | Evidence/status |
| --- | --- | --- |
| Cold launch | Launch existing-data installation; finite loading, clear failure if API unavailable, no unmatched root | NOT VERIFIED |
| Registration | New dedicated account, generic202 copy, actual inbox arrival separately recorded; no premature verified state | NOT VERIFIED |
| Verification | Open real `provia:///verify-email?...` link cold and warm; only explicit confirmation consumes action; expired/reused link stays unverified with recovery | NOT VERIFIED |
| Login/restore | Login, background, lock/unlock, process close/relaunch; account restores or safely requires login without a loop | NOT VERIFIED |
| Rotation | Allow access expiry, resume/request, observe safe successful refresh without token logs; network interruption must not reuse uncertain rotation | NOT VERIFIED |
| Reset | Real received reset link cold/warm; explicit submit, success clears session and revokes older sessions; invalid link preserves form and explains recovery | NOT VERIFIED |
| Account isolation | Sign out/account switch; old cached views/drafts cannot appear for the other account; revocation yields bounded sign-in recovery | NOT VERIFIED |
| Setup | DOB, kg/lb, profile IANA zone, four goal labels, authoritative server preview/confirm; interrupted receipt replay without duplicate goal | NOT VERIFIED |
| Navigation | All six tabs; nested header/hardware/predictive Back; dirty-form cancel retains input, discard explicit, pending/uncertain writes guarded | NOT VERIFIED |
| Dashboard | Actual totals/four macros, unknown versus0, negative remaining, workout resume/start and goal/weight context; refresh after writes and foreground | NOT VERIFIED |
| Food | Local/provider search pagination, correct product/source/detail/known portions and server quantity preview | NOT VERIFIED |
| Meals/recipes | Create/edit/delete measured meals with confirmation, notes-only preserves snapshots; custom food nulls/known zero; measured immutable recipe | NOT VERIFIED |
| Barcode permission | Deny, deny permanently, settings return; manual digits work in all cases, no microphone prompt | NOT VERIFIED |
| Barcode capture | Actual supported label in normal/poor light; one lookup per capture, leading0 retained, returned food/label independently checked | NOT VERIFIED |
| Barcode failure | Unknown/unsupported label404, provider outage/network timeout; input retained, loading ends, no invented food; leave during lookup cannot navigate later | NOT VERIFIED |
| Workouts | Custom exercise, weekly plan ordering/duplicate/activation; scheduled/unplanned start, persisted active restore; sets reps/weights/warmup/skipped; complete/cancel and immutable history | NOT VERIFIED |
| Tracking | Weight/water/activity/sleep create/edit/delete on dedicated records; goal change requires separate preview; stale409 demands re-preview | NOT VERIFIED |
| Dates/units | Profile zone unlike phone; midnight and overnight sleep, offset field fallback, nullable optional activity, canonical kg retained through lb display | NOT VERIFIED |
| Progress/profile | 7/30/custom real history, accessible chart table, profile replacement retains DOB/preferences, paged goals; no fake gaps/zeros | NOT VERIFIED |
| Failure/recovery | Controlled local/staging cold start,401/403, database not ready, malformed response and network timeout; safe request IDs, bounded retry, no automatic writes | NOT VERIFIED |
| Health Connect | Current build honestly reports not included/never synced, no request or upload | NOT VERIFIED |

For process-kill tests, ordinary drafts are mounted-memory only. Record that expected
limit rather than asserting crash persistence. Reconcile actual server records before
resubmitting an unknown write; onboarding has its separate encrypted receipt path.
Do not induce failure by altering the live database or disabling authentication.

## Visual and accessibility matrix

Capture welcome/login/register/onboarding/dashboard/nutrition/search/detail/meal/recipes,
workout overview/plan/active, weight/water/activity/sleep/progress/profile/security.
For each, record light/dark, default/largest font and display scale, smallest supported
window where legitimately available, keyboard open/closed, gesture/three-button
navigation, TalkBack traversal/labels and touch targets. Check wrapping, clipped buttons,
safe areas, charts/tables, scroll reachability, pending/empty/error states and consistent
typography. Physical device screenshots certify only the actual captured configuration;
web screenshots do not certify Android native controls.

## Separate future Health Connect gate

Only after a reviewed native adapter compiles: inspect real provider availability,
read-only type permissions and denial/revocation; select actual measured records;
test overlapping phone/watch steps, profile-day bounds/DST, ID replay/changed imports,
manual-day replacement confirmation, source conflicts and account-switch cancellation.
Never seed fake sensor readings or map permission failure to zero. Confirm logout
cancels pending uploads and later account cannot inherit consent/checkpoints. No
automatic deletion/sync should be enabled merely to complete this checklist.

Acceptance requires observed expected behavior and recorded evidence for every
applicable row. Unperformed rows remain NOT VERIFIED, not PASS. Release approval,
backend deployment, real mail configuration, cloud build and installation each remain
separate authorized operations under `phase6-release-readiness.md`.
