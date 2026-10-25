import { useHostedAuth } from "@clerk/expo/hosted-auth";
import { Redirect } from "expo-router";
import { useAuth } from "@clerk/expo";
import { useState } from "react";
import { Action, Card, Copy, ErrorNote, Page, Title } from "../components/ui";

export default function Welcome() {
  const { startHostedAuth } = useHostedAuth();
  const { isSignedIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function authenticate(mode: "sign-in" | "sign-up") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await startHostedAuth({ mode });
    } catch {
      setError(
        "Clerk could not complete sign-in. Check your connection and Native API configuration, then try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (isSignedIn) return <Redirect href="/" />;
  return (
    <Page safeTop>
      <Title eyebrow="PROVIA">A clearer path to your healthier day.</Title>
      <Copy>
        Your nutrition, movement and recovery. One personal plan, grounded in
        your real progress.
      </Copy>
      <Card>
        <Title>Start with you.</Title>
        <Copy>
          Create your profile, preview your nutrition targets, and build a
          routine at your pace.
        </Copy>
      </Card>
      {error && <ErrorNote message={error} />}
      <Action
        label={busy ? "Opening secure sign-in…" : "Create your account"}
        disabled={busy}
        onPress={() => void authenticate("sign-up")}
      />
      <Action
        secondary
        label="I already have an account"
        disabled={busy}
        onPress={() => void authenticate("sign-in")}
      />
      <Copy>
        Sign-in opens Clerk in your browser. PROVIA does not collect your
        password.
      </Copy>
    </Page>
  );
}
