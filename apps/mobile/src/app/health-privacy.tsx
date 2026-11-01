import { Copy, Page, Title } from "../components/ui";

export default function HealthPrivacy() {
  return <Page><Title>Health Connect privacy</Title>
    <Copy>PROVIA requests read-only Steps, Weight and Sleep access only for categories you select. No Health Connect writes or background reads run.</Copy>
    <Copy>Sync is manual and sends supported records over HTTPS to your signed-in PROVIA account. Saved values come from confirmed backend responses. Missing readings are not zero, and imports do not automatically change calorie goals.</Copy>
    <Copy>Import identity and sync metadata are stored in native SecureStore for your account. Health records are excluded from ordinary diagnostics.</Copy>
    <Copy>Manage or revoke access in Health Connect. Revocation stops future reads but does not erase saved PROVIA records. Review or delete them in Tracking. Only import your own device history.</Copy>
  </Page>;
}
