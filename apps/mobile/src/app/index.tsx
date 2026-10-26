import { useAuth } from "../providers/auth";
import { Redirect } from "expo-router";
import { useCallback, useState } from "react";
import { Action, Busy, Copy, ErrorNote, Page, Title } from "../components/ui";
import { useApi } from "../providers/api";
import { loadSetup, type SetupStep } from "../lib/onboarding";
import { useResource } from "../hooks/use-resource";
import { errorMessage } from "../lib/api-client";

function ResolveAccount() {
  const api = useApi();
  const { signOut } = useAuth();
  const [step, setStep] = useState<SetupStep>("session");
  const load = useCallback(
    (signal: AbortSignal) => loadSetup(api, signal, setStep),
    [api],
  );
  const { data, error, reload } = useResource(load);
  if (data)
    return (
      <Redirect
        href={data.profile && data.active ? "/dashboard" : "/onboarding"}
      />
    );
  return (
    <Page safeTop>
      <Title eyebrow="Welcome back">Your next step</Title>
      {error ? (
        <>
          <ErrorNote message={errorMessage(error)} />
          <Action label="Try again" onPress={reload} />
          <Action secondary label="Sign out" onPress={() => void signOut()} />
        </>
      ) : (
        <>
          <Busy label="Connecting to your account…" />
          <Copy>
            {step === "session"
              ? "Verifying session · GET /me"
              : step === "profile"
                ? "Loading profile · GET /profile"
                : "Loading plan · GET /goals"}
          </Copy>
          <Copy>
            A free backend can take around a minute to wake up. Your saved data
            stays in Neon.
          </Copy>
        </>
      )}
    </Page>
  );
}
export default function Index() {
  const { isSignedIn, user } = useAuth();
  return !isSignedIn ? (
    <Redirect href="/welcome" />
  ) : !user?.email_verified ? (
    <Redirect href="/verify-email" />
  ) : (
    <ResolveAccount />
  );
}
