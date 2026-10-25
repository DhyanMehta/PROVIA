import { useAuth, useClerk } from "@clerk/expo";
import { Redirect } from "expo-router";
import { useCallback } from "react";
import { Action, Busy, Copy, ErrorNote, Page, Title } from "../components/ui";
import { useApi } from "../providers/api";
import { loadSetup } from "../lib/onboarding";
import { useResource } from "../hooks/use-resource";
import { errorMessage } from "../lib/api-client";

function ResolveAccount() {
  const api = useApi();
  const { signOut } = useClerk();
  const load = useCallback(
    (signal: AbortSignal) => loadSetup(api, signal),
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
            A free backend can take around a minute to wake up. Your saved data
            stays in Neon.
          </Copy>
        </>
      )}
    </Page>
  );
}
export default function Index() {
  const { isSignedIn } = useAuth();
  return isSignedIn ? <ResolveAccount /> : <Redirect href="/welcome" />;
}
