# Phase 5 remaining acceptance and limitations

This file distinguishes completed source work from unperformed acceptance. No item
below is marked resolved by TypeScript, a mocked native module, or a generated bundle.

## Native prerequisites and device acceptance

- Health Connect remains disabled. The audited official native library has an Expo
  plugin/New Architecture support, but its example targets a different SDK/RN pair.
  Exact SDK58/RN0.88.1 compilation, actual read permissions, foreground reads, stable-ID
  replay, overlapping phone/watch aggregation, revocation, DST and account isolation
  have not been proven on this project/device. No fake availability or success timestamp
  is shown. Manual tracking is implemented independently.
- Native Android compilation/APK installation needs a suitable JDK and Android SDK.
  Inspection found only an Oracle Java8 launcher/shim on PATH, no adb/Gradle and no
  SDK in the audited standard locations. Prebuild and Hermes export do not establish
  successful Gradle compilation, signing or device execution. No alternative binary
  was installed to evade Application Control.
- Camera/manual barcode UI and camera-only native configuration are implemented.
  Actual scanner behavior, camera denial/settings transitions and label verification
  require a new native build and Samsung A35 test. No cloud build was submitted.
- Rendered visual, dark/light, small-width, large-font, keyboard, TalkBack and physical
  back/deep-link acceptance remain unverified. The computer-use safety check ended the
  visual attempt because it could not establish the browser URL. No screenshot or
  rendered-native success is claimed, and that stop was not bypassed.

## External deployment / data prerequisites

- The currently deployed Render API is older than the frozen local Phase4 backend.
  The existing application database remains at0004; approved deployment/migrations
  0005–0007 are a separate step. Local disposable-DB success cannot certify that service.
- Actual first-party email delivery depends on approved sender/provider/key/worker
  configuration and real received links. The integration harness deliberately replaces
  only external delivery with a controlled sink; it is not evidence of inbox delivery.
- Verified legally reusable Indian nutrition coverage remains blocked pending an
  approved dataset. Source search, measured custom foods and recipes are functional
  alternatives; they are not mislabeled as a verified Indian catalog.
- npm audit findings remain an explicit release risk. No forced Expo downgrade or
  blanket audit suppression was used. The final test report records the exact result.

## Deliberate supported limits

- Ordinary food/plan/set/tracking/profile drafts and create replay closures are bounded
  to the mounted form. Dirty/pending/unknown navigation is guarded, and failed requests
  retain input; there is no automatic offline/background write queue. Process termination
  can lose ordinary drafts/retry identity. Check saved records before creating again.
  Onboarding's encrypted account-scoped pending goal receipt is a deliberate persistent
  exception and preserves older unresolved markers.
- Local rest countdown clears when leaving its screen. Workout elapsed time and active
  session restoration use actual server timestamps/state.
- Recipes are immutable under the frozen contract. Food responses provide no photo
  field. Water logs have no detail GET. Erasure/self-service account deletion is not
  available in the frozen API. The UI explains those limits rather than inventing APIs.
- Profile replacement has no expected-goal precondition in the frozen API. Another
  device can change a goal after preview; the returned/refreshed result is authoritative.
  Weight-log goal application does carry both expected UUID and weight preconditions.

Required acceptance is enumerated in `frontend-phase5-device-checklist.md`. Release
readiness remains partial until the applicable native, visual, deployment and external
checks are performed; local feature source completion does not remove those gates.
