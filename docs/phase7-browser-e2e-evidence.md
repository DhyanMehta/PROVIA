# Phase 7 actual browser evidence

30 October 2026, Asia/Calcutta. Authorized in-app browser, Expo58 web preview
at `http://localhost:8089`, source starting at f5aace0d84bafbfe9ed81f15f1d9c327ac3bd37f.
Configured backend is `https://provia-mag7.onrender.com/api/v1`; its first-party
endpoints are absent. No real test inbox has been supplied/authorized.

| ID | Actual steps and expected result | Actual outcome | Status/evidence |
| --- | --- | --- | --- |
| B01 | Open app; public welcome should render | Welcome renders; visible session-restoration failure | PARTIAL; screenshot inspected inline, not saved |
| B02 | Click Create your account | Real registration route/form renders | PASS, shared rendered web UI only |
| B03 | Submit registration with empty fields; expect validation and no accepted claim | Name/password/match validation visible | PASS; `artifacts/phase7-e2e/register-required-fields.png` |
| B04 | Click Already registered; expect login | Login form renders, empty submission disabled | PASS |
| B05 | Enter synthetic nonexistent `.invalid` identity and synthetic password; submit login | Generic error visible; source calls native storage cleanup before login request, unavailable on web | BLOCKED; `artifacts/phase7-e2e/login-storage-failure.png`, inputs cleared before capture |
| B06 | Click Forgot password; expect recovery form and empty submission disabled | Recovery route/form renders, reset button disabled | PASS; `artifacts/phase7-e2e/recovery-empty-form.png` |

Screenshots above actually exist under the ignored local evidence directory. No
password, action token, JWT or health record appears in them. They are web evidence,
not Android screenshots. Synthetic login inputs are not a real authorized account.

Confirmed platform diagnosis: `expo-secure-store/build/ExpoSecureStore.web.js`
exports an empty object. The existing native adapter calls get/set/delete functions;
restore catches this failure. `signIn` awaits `forget()` before the login HTTP call;
`forget` awaits native storage deletion. Thus the observed web error occurs before
the authentication request. No HTTP status is claimed for this attempt. No network
interception or hardcoded authentication was used. This is not established as the
cause of the user's phone registration error.

Console coverage is incomplete: no redacted console export/network trace captured;
absence of a visible overlay is not proof of no console errors. No raw network logs
or request bodies were saved. No Playwright suite/trace was executed; these flows
used actual authorized browser interactions with rendered controls.

Registration delivery/accepted state, invalid-email server response, mismatch,
double-submit, verification/reset inbox arrival, successful login/onboarding/dashboard,
logout, expiry,401/403, timeout and malformed-response browser acceptance remain
unexecuted or blocked. Public visual checks cannot satisfy the authentication gate.
No web storage replacement or auth bypass was introduced.
