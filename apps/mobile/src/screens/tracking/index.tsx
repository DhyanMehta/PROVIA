import { useCallback } from "react";
import { router } from "expo-router";
import { Action, Card, Copy, MetricRow, Page, Title, Value } from "../../components/ui";
import { useApi } from "../../providers/api";
import { useResource } from "../../hooks/use-resource";
import { dashboardData } from "../../lib/fitness-contracts";
import { kgToLb } from "../../lib/form-values";
import { elapsedLabel } from "./data";
import { ReadStatus, useTrackingContext } from "./shared";

export function TrackingScreen() {
  const api = useApi(), context = useTrackingContext();
  const load = useCallback((signal: AbortSignal) => api.request("get", "/api/v1/dashboard/today", { signal, validate: dashboardData }), [api]);
  const resource = useResource(load), data = resource.data;
  return <Page onRefresh={() => { resource.reload(); context.reload(); }} refreshing={resource.loading}>
    <Title eyebrow="Tracking">Your daily signals</Title><Copy>Weight, hydration, movement and rest from your saved records.</Copy>
    <ReadStatus resource={context} /><ReadStatus resource={resource} />
    {data ? <>
      <Card><Value label="Latest measured weight" value={data.weight ? `${context.unit === "lb" ? kgToLb(data.weight.weight_kg) : data.weight.weight_kg} ${context.unit}` : "Not recorded"} /><Copy>{data.weight ? new Date(data.weight.recorded_at).toLocaleString(undefined, { timeZone: data.timezone }) : "Log a measurement to start your trend."}</Copy><Action label="Weight history and goals" onPress={() => router.push("/tracking/weight")} /><Action label="Log weight" secondary onPress={() => router.push("/tracking/weight/new")} /></Card>
      <Card><Value label="Water today" value={data.water.has_logs ? `${data.water.consumed_ml} ml` : "No water logged"} /><MetricRow label="Daily target" value={data.water.target_ml === null ? "Not set" : `${data.water.target_ml} ml`} /><Action label="Track water" onPress={() => router.push("/tracking/water")} /></Card>
      <Card><Value label="Steps today" value={data.activity === null ? "Not recorded" : data.activity.steps.toLocaleString()} /><MetricRow label="Active minutes" value={data.activity?.active_minutes == null ? "Unknown" : String(data.activity.active_minutes)} /><Action label="Steps and activity" onPress={() => router.push("/tracking/activity")} /></Card>
      <Card><Value label="Sleep · wake-up day" value={elapsedLabel(data.sleep.duration_seconds)} /><Copy>Elapsed time includes awake stages; this is not an estimate of time asleep.</Copy><Action label="Track sleep" onPress={() => router.push("/tracking/sleep")} /></Card>
    </> : null}
    <Action label="Health Connect readiness" secondary onPress={() => router.push("/tracking/health-connect")} />
  </Page>;
}
