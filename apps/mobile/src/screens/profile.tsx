import { useAuth } from "../providers/auth";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Platform } from "react-native";
import {
  Action,
  Busy,
  Card,
  Copy,
  ErrorNote,
  Page,
  Title,
  Value,
} from "../components/ui";
import { useResource } from "../hooks/use-resource";
import { loadSetup } from "../lib/onboarding";
import { ApiError, errorMessage } from "../lib/api-client";
import { metric } from "../lib/format";
import { useApi } from "../providers/api";
import { profileSummary } from "../lib/fitness-contracts";

export default function Profile() {
  const api = useApi();
  const { signOut } = useAuth();
  const load = useCallback(
    async (signal: AbortSignal) => {
      const data = await loadSetup(api, signal);
      if (!profileSummary(data))
        throw new ApiError("Invalid profile summary.", 200, "INVALID_RESPONSE");
      return data;
    },
    [api],
  );
  const { data, error, reload } = useResource(load);
  const [failure, setFailure] = useState("");
  async function exit() {
    try {
      await signOut();
    } catch {
      setFailure("Sign-out did not complete. Please try again.");
    }
  }
  function confirmExit() {
    if (Platform.OS === "web") void exit();
    else
      Alert.alert(
        "Sign out of PROVIA?",
        "Your saved profile and goals stay in your account.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Sign out",
            style: "destructive",
            onPress: () => void exit(),
          },
        ],
      );
  }
  return (
    <Page>
      <Title eyebrow="Your account">Built around you.</Title>
      {!data && !error && <Busy />}
      {!!error && (
        <>
          <ErrorNote message={errorMessage(error)} />
          {data && (
            <Copy>Showing previously fetched profile and goal values.</Copy>
          )}
          <Action label="Retry" onPress={reload} />
        </>
      )}
      {data && (
        <>
          <Card>
            <Value
              label="Name"
              value={data.profile?.display_name ?? "Profile not set"}
            />
            <Value
              label="Height"
              value={metric(data.profile?.height_cm, "cm")}
            />
            <Value
              label="Profile weight"
              value={metric(data.profile?.current_weight_kg, "kg")}
            />
            <Copy>{data.profile?.timezone ?? "UTC"}</Copy>
          </Card>
          <Card>
            <Value
              label="Goal weight"
              value={metric(data.active?.target_weight_kg, "kg")}
            />
            <Value
              label="Daily calorie target"
              value={metric(data.active?.daily_calorie_target, "kcal")}
            />
            <Copy>
              Profile measurements and historical goal snapshots are separate. A
              new goal only activates after you explicitly confirm it.
            </Copy>
          </Card>
          <Action
            label="Review or update my goal"
            onPress={() => router.push("/onboarding")}
          />
        </>
      )}
      {failure && <ErrorNote message={failure} />}
      <Action secondary label="Sign out" onPress={confirmExit} />
      <Action
        secondary
        label="Account & sessions"
        onPress={() => router.push("/account")}
      />
    </Page>
  );
}
