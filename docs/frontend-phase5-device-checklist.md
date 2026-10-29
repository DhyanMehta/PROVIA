# Phase 5 Samsung Galaxy A35 acceptance

No Phase 5 cloud build, APK installation, phone reset, app-data clearance or real-device
success is authorized/inferred by local tests. Retain `com.provia.app`, EAS owner
`dhyan_mehta`, project `4e131be3-7394-4883-ae44-498c63bfcac5`, scheme `provia`, existing
icons and signing identity. A new native APK will be required for camera/native
dependency changes; submission is a separate approval step.

Before device acceptance, deploy the frozen matching backend and approved migrations
to the intended environment, verify HTTPS/readiness and real first-party email delivery.
Use a dedicated test account and avoid deleting existing records. Do not use an older
Render service's missing endpoints as evidence of a frontend contract defect.

- [ ] Register and check generic accepted copy; verify actual delivery separately.
- [ ] Open `provia:///verify-email?token=…` and confirm once; test expired/reused links.
- [ ] Login, relaunch, lock/unlock and resume; check refresh and account isolation.
- [ ] Request/reset password through actual email; verify old sessions are revoked.
- [ ] Complete DOB, unit, IANA zone and all goal-type choices; verify server preview,
  explicit confirmation, authoritative completion and interrupted-save reconciliation.
- [ ] Check all six tabs, nested/header/hardware/predictive Back and cold-start links.
- [ ] Check warm/dark themes, 320/360 dp layouts and largest Android font/display scale;
  TalkBack labels, focus order, touch areas, keyboard avoidance and contrast.
- [ ] Check calorie/four-macro progress, negative remaining amounts, unknown states,
  pull-to-refresh, app resume and midnight in a profile zone different from the phone.
- [ ] Search/page each food source, inspect provenance and known measured portions;
  preview grams/counts and create/edit/delete meals without changing old snapshots.
- [ ] Create measured custom foods with nullable nutrients and aliases; create/list/view
  an actual recipe and cooked yield. No invented recipe editing/deletion.
- [ ] Deny camera, deny permanently, use manual barcode, open Settings, allow scanning,
  scan a real supported barcode and verify product/label. Check missing/unsupported food.
- [ ] Create/edit/archive custom exercises; create a seven-day plan, order exercises,
  activate/duplicate/edit/delete, start a scheduled or unplanned session and relaunch.
- [ ] Log/edit/delete working/warmup/completed/skipped sets; check rest/elapsed timers,
  pending-set guard, complete/cancel, immutable history and actual personal records.
- [ ] Test dirty form Back/close, offline save, reconnect and explicit same-request retry;
  compare saved records before repeating any unkeyed write. Force-stop recovery is
  separate from mounted-draft retention.
- [ ] Create/edit/delete weight, water and sleep records; change water target; replace
  a manual activity day. Verify null/zero, overnight sleep, explicit offsets and stages.
- [ ] Review weight-to-goal preview, change the goal/weight elsewhere, confirm stale409
  requires a new preview; logging alone must not change historical targets.
- [ ] Inspect 7/30/custom progress and selectable real values; gaps stay unknown.
- [ ] Edit profile with kg/lb preferences and DOB retained; review goal history/revision.
  Change password, revoke another/current session, logout and logout all.
- [ ] Test timeout, network failure, cold start, 401/403, database-readiness failure,
  malformed response and account switching without exposing sensitive diagnostics.
- [ ] Health Connect must say native support is not included/verified and never claim
  a successful sync. Enabling it requires a separate compatible native build, permission,
  revocation, overlapping phone/watch, DST, account-switch and stable-ID replay tests.

Record actual build ID, API revision, device/Android version, test date and evidence
for each check. A check remains unverified until performed on the device.
