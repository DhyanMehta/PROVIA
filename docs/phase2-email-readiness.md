# Phase 2 — email delivery readiness

Review date: 27 October 2026. This is configuration preparation and mocked-provider
verification, not evidence of a real email send or inbox receipt.

## Reviewed behavior

`services/api/app/modules/auth/email.py` uses the fixed Resend HTTPS send endpoint,
verified TLS, a five-second transport timeout, no redirects and no automatic retry.
The request supplies `from`, a recipient list, subject and plain text according to
the [official send API](https://resend.com/docs/api-reference/emails/send-email).
Provider errors and malformed success responses become sanitized `EMAIL_UNAVAILABLE`
errors; response bodies, credentials and action values are not logged or returned.

The adapter now validates one bounded sender mailbox and rejects controls, multiple
addresses and malformed API-key values before any provider request. This does not
prove sender ownership, provider permission, available quota or deliverability.
SMTP uses a verified TLS context and closes connections even if STARTTLS fails.
Use HTTPS for Render Free: [standard SMTP ports are blocked](https://render.com/docs/free).

Verification links use `provia:///verify-email?token=...`; reset links use
`provia:///reset-password?token=...`. The backend generates opaque action values,
stores only their digests and enforces purpose, expiry and one-time use. Verification
expires after 30 minutes and reset after 15 minutes. Resend invalidates older actions
of the same purpose. Reset revokes existing sessions. Public endpoints never expose
these action values. The UI requires an explicit action rather than consuming a link
automatically when a mail scanner or router opens it.

The service uses savepoints so failed provider delivery does not leave a newly
issued account/action behind. Provider acceptance followed by a failed database
commit can still produce an unusable link; the user must request a new one. A
generic 202 response proves neither issuance nor delivery.

**Open P2:** eligible addresses trigger synchronous delivery while unknown/ineligible
addresses do not. Generic responses and rate limits do not eliminate measurable
timing enumeration. Public enrollment needs a reviewed resolution or explicit risk
acceptance before release; no bypass, artificial delay or untracked background queue
was added to conceal this finding.

## Free-plan operator setup — not performed

1. Use the owner's Resend account with the Free plan; do not enable paid add-ons or
   overages. Check the actual [current account limits](https://resend.com/pricing).
2. For public recipients, add an existing owned domain/subdomain and the exact
   provider-supplied SPF/DKIM DNS records. Wait for Verified status. Preserve existing
   mail routing. Follow [domain verification](https://resend.com/docs/dashboard/domains/introduction).
3. Without an owned verified domain, the provider test domain permits only the
   account owner's recipient. It is not public signup; see the
   [test-domain restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).
   If no permitted sender is available, verification stays blocked.
4. Create a sending-access API key, scoped to the domain where available. Store it
   only as a server secret. Disable open/link tracking for credential messages.
5. After explicit live-configuration approval, set `AUTH_EMAIL_PROVIDER=resend`,
   `RESEND_API_KEY` and `RESEND_FROM` in Render. Use the actual authorized mailbox,
   optionally with a display name. No domain/key/sender has been invented here.
6. After separately approved migration and deployment, run the read-only preflight:

   ```powershell
   Set-Location 'D:\Dhyan\Self Projects\Provia\services\api'
   python -m uv run --no-sync python -m scripts.verify_auth_readiness
   ```

   This command loads local Settings/.env, not Render's live environment. Confirm
   the intended database privately; local configuration/schema PASS does not prove
   Render parity or actual delivery. Do not copy server secrets merely to make this
   local check green. Remote controlled authentication tests are still required.

## Evidence and real acceptance gate

The coordinator ran the email, readiness and security unit files together: **52
passed**. The 28 email cases cover both link purposes, fixed API contract, malformed
sender/key rejection, TLS/no-redirect/timeout settings, sanitized provider errors,
no retries, and SMTP failure cleanup. The final integrated backend results are in
[the consolidated report](phase2-auth-readiness-report.md). No test claimed a real
send; the email specialist's interrupted tool calls are not counted as test evidence.

After approval, use controlled accounts and the new signed APK to verify:

- Register → real inbox receipt → cold/warm link → explicit verify → login.
- Resend → old link rejected → new link accepted once; expired/replayed links fail.
- Forgot password → actual reset receipt → new password works → old sessions fail.
- Unknown/duplicate address responses stay generic, provider quota/denial stays safe,
  and diagnostics contain only safe status/category/request IDs.
- A mail client that refuses custom-scheme links is an unresolved acceptance case;
  do not infer device success from mocked tests or bypass email verification.

Keep real passwords, action URLs, JWTs, refresh values, sender keys and personal
fitness data out of shared logs and reports. Actual DNS verification, provider
permission, inbox delivery, Android link behavior and live flow acceptance remain
**CONFIGURATION REQUIRED / NOT VERIFIED**.
