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
  MacroProgress,
  SectionHeader,
} from "../components/ui";
import { useResource } from "../hooks/use-resource";
import { useApi } from "../providers/api";
import { useAuth } from "../providers/auth";
import { errorMessage } from "../lib/api-client";
import { metric } from "../lib/format";
import { dashboardData } from "../lib/fitness-contracts";
import { kgToLb } from "../lib/form-values";
import { DashboardContext } from "./dashboard-context";

export default function Dashboard() {
  const api = useApi();
  const { user } = useAuth();
  const load = useCallback(
    (signal: AbortSignal) =>
      api.request("get", "/api/v1/dashboard/today", {
        signal,
        validate: dashboardData,
      }),
    [api],
  );
  const { data, error, loading, reload } = useResource(load);
  const preferences = useResource(useCallback(signal => api.request("get", "/api/v1/profile", { signal, validate: value => !!value && ["kg", "lb"].includes(value.preferred_weight_unit) }), [api]));
  const weightUnit = preferences.data?.preferred_weight_unit ?? "kg";
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
    <Page refreshing={loading} onRefresh={reload}>
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
        <SectionHeader title="Today's nutrition" description="Your logged intake and the server's daily budget." />
        <MacroProgress label="Calories" unit="kcal" consumed={hasMeals && nutrition.calories.consumed !== null ? Number(nutrition.calories.consumed) : null} target={nutrition.calories.target === null ? null : Number(nutrition.calories.target)} remaining={nutrition.calories.remaining === null ? null : Number(nutrition.calories.remaining)} />
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
          <MacroProgress
            key={key}
            label={key === "fat" ? "Fats" : key[0].toUpperCase() + key.slice(1)}
            consumed={hasMeals && nutrition[key].consumed_g !== null ? Number(nutrition[key].consumed_g) : null}
            target={nutrition[key].target_g === null ? null : Number(nutrition[key].target_g)}
            remaining={nutrition[key].remaining_g === null ? null : Number(nutrition[key].remaining_g)}
          />
        ))}
      </Card>
      <SectionHeader title="Make a little progress" description="A quick way into today's logs." />
      <Action label="Add food" onPress={() => router.push("/nutrition/search")} />
      <Action secondary label="Start or resume workout" onPress={() => router.push("/workouts/active")} />
      <Action secondary label="Add water" onPress={() => router.push("/tracking/water")} />
      <Action secondary label="Log weight" onPress={() => router.push("/tracking/weight/new")} />
      <DashboardContext date={data.date} zone={data.timezone} unit={weightUnit} target={data.goal?.target_weight_kg ?? null} />
      <Card>
        <Value
          label="Latest recorded weight"
          value={metric(data.weight ? weightUnit === "lb" ? kgToLb(data.weight.weight_kg) : data.weight.weight_kg : null, weightUnit)}
        />
        <Copy>
          {data.weight
            ? `Measured ${new Date(data.weight.recorded_at).toLocaleDateString(undefined, { timeZone: data.timezone })}. View Progress for your weight trend.${!preferences.data ? " Canonical kilograms are shown while preferences are unavailable." : ""}`
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
