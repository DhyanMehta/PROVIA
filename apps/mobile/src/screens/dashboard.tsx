import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
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
import { useApi } from "../providers/api";
import { useAuth } from "../providers/auth";
import { errorMessage } from "../lib/api-client";
import { metric } from "../lib/format";

export default function Dashboard() {
  const api = useApi();
  const { user } = useAuth();
  const load = useCallback(
    (signal: AbortSignal) =>
      api.request("get", "/api/v1/dashboard/today", { signal }),
    [api],
  );
  const { data, error, loading, reload } = useResource(load);
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focused.current) reload();
      else focused.current = true;
    }, [reload]),
  );
  if (!data)
    return (
      <Page>
        <Title eyebrow="PROVIA">Your day, in focus.</Title>
        {error ? (
          <>
            <ErrorNote message={errorMessage(error)} />
            <Action label="Reconnect" onPress={reload} />
          </>
        ) : (
          <>
            <Busy label="Fetching your day…" />
            <Copy>The free backend may take about a minute to wake up.</Copy>
          </>
        )}
      </Page>
    );
  const nutrition = data.nutrition;
  const hasMeals = nutrition.meals.length > 0;
  return (
    <Page>
      <Copy>
        {user?.name ? `Welcome back, ${user.name}.` : "Welcome back."}
      </Copy>
      <Title eyebrow={`${data.date} · ${data.timezone}`}>
        Your day, in focus.
      </Title>
      {!!error && (
        <ErrorNote
          message={`Refresh failed. Showing previously fetched data. ${errorMessage(error)}`}
        />
      )}
      <Card>
        <Value
          label="Daily calorie target"
          value={metric(nutrition.calories.target, "kcal")}
        />
        <Value
          label="Consumed · logged meals"
          value={
            hasMeals
              ? metric(nutrition.calories.consumed, "kcal")
              : "Nothing logged yet"
          }
        />
        <Value
          label="Remaining logged budget"
          value={metric(nutrition.calories.remaining, "kcal")}
        />
        {!hasMeals && (
          <Copy>
            No meals recorded today. Remaining budget does not establish actual
            intake.
          </Copy>
        )}
        {nutrition.calories.target === null && (
          <Action
            label="Set your nutrition goal"
            onPress={() => router.push("/onboarding")}
          />
        )}
      </Card>
      <Card>
        {(["protein", "carbs", "fat", "fiber"] as const).map((key) => (
          <Value
            key={key}
            label={`${key === "fat" ? "Fats" : key[0].toUpperCase() + key.slice(1)} · logged / target`}
            value={`${hasMeals ? metric(nutrition[key].consumed_g) : "Not logged"} / ${metric(nutrition[key].target_g, "g")}`}
          />
        ))}
      </Card>
      <Card>
        <Value
          label="Latest recorded weight"
          value={metric(data.weight?.weight_kg, "kg")}
        />
        <Copy>
          {data.weight
            ? `Measured ${new Date(data.weight.recorded_at).toLocaleDateString()}. View Progress for your weight trend.`
            : "No weight measurement recorded. Open Tracking to review your recorded signals."}
        </Copy>
        <Value
          label="Water"
          value={
            data.water.has_logs
              ? metric(data.water.consumed_ml, "ml")
              : "No water logged"
          }
        />
        <Copy>
          {data.water.target_ml === null
            ? "No daily water target set."
            : `Daily target: ${metric(data.water.target_ml, "ml")}`}
        </Copy>
        <Value label="Steps" value={metric(data.activity?.steps, "steps")} />
        <Value
          label="Workouts completed today"
          value={
            data.workouts.total_workouts
              ? String(data.workouts.total_workouts)
              : "No workouts logged"
          }
        />
        <Value
          label="Sleep · wake-up date"
          value={
            data.sleep.duration_seconds === null
              ? "No sleep recorded"
              : `${Math.floor(data.sleep.duration_seconds / 3600)}h ${Math.floor((data.sleep.duration_seconds % 3600) / 60)}m`
          }
        />
      </Card>
      <Action
        label={loading ? "Refreshing…" : "Refresh today"}
        disabled={loading}
        onPress={reload}
      />
      <Action
        secondary
        label="Profile & settings"
        onPress={() => router.push("/profile")}
      />
      {["Nutrition", "Workouts", "Tracking", "Progress"].map((section) => (
        <Action
          key={section}
          secondary
          label={section}
          onPress={() =>
            router.push(
              section === "Nutrition"
                ? "/nutrition"
                : section === "Workouts"
                  ? "/workouts"
                  : section === "Tracking"
                    ? "/tracking"
                    : "/progress",
            )
          }
        />
      ))}
    </Page>
  );
}
