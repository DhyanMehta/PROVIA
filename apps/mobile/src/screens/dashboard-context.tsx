import { useCallback } from "react";
import { router } from "expo-router";
import { Action, Card, Copy, ErrorNote, LoadingSkeleton, MetricRow, SectionHeader } from "../components/ui";
import { ObservedChart } from "../components/observed-chart";
import { useResource } from "../hooks/use-resource";
import { useApi } from "../providers/api";
import { errorMessage } from "../lib/api-client";
import { dateOnly, kgToLb, shiftDate } from "../lib/form-values";
import { metric } from "../lib/format";
import { activePlan, activeWorkout, titleOf, weekdays } from "./workouts/data";
import { StartWorkout } from "./workouts/start-workout";
import { pageData, weightData } from "./tracking/data";

export function DashboardContext({ date, zone, unit, target }: { date: string; zone: string; unit: "kg" | "lb"; target: string | null }) {
  const api = useApi();
  const training = useResource(useCallback(async signal => {
    const [active, plan] = await Promise.all([activeWorkout(api, signal), activePlan(api, signal)]);
    return { active, plan };
  }, [api]));
  const weights = useResource(useCallback(signal => api.request("get", "/api/v1/weight-logs", { signal, query: { start_date: shiftDate(date, -29), end_date: date, limit: 60, offset: 0 }, validate: pageData(weightData) }), [api, date]));
  const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  const scheduled = training.data?.plan?.days.find(day => day.day_of_week === weekday);
  return <>
    <Card><SectionHeader title="Your workout today" description={`${weekdays[weekday]} · ${zone}`} />
      {!training.data && training.loading ? <LoadingSkeleton lines={2} /> : null}
      {training.error ? <><ErrorNote message={errorMessage(training.error)} /><Action secondary label="Refresh workout context" onPress={training.reload} /></> : null}
      {training.data?.active ? <><Copy>{titleOf(training.data.active)} · {training.data.active.sets.length} recorded sets</Copy><Action label="Resume your saved active workout" onPress={() => router.push({ pathname: "/workouts/sessions/[sessionId]", params: { sessionId: training.data!.active!.id } })} /></> : null}
      {training.data?.plan ? <><Copy>{training.data.plan.name}</Copy><Copy>{scheduled ? scheduled.is_rest ? "Scheduled rest day" : `${scheduled.name} · ${scheduled.exercises.length} planned exercises` : "No session scheduled for today."}</Copy>{scheduled && !scheduled.is_rest && !training.data.active ? <StartWorkout dayId={scheduled.id} label={`Start today's ${scheduled.name}`} /> : null}<Action secondary label="Review your active plan" onPress={() => router.push({ pathname: "/workouts/plans/[planId]", params: { planId: training.data!.plan!.id } })} /></> : training.data ? <Copy>No active plan. You can create a plan or start an unplanned workout.</Copy> : null}
    </Card>
    <Card><SectionHeader title="Your weight direction" description="Actual measurements from the last 30 profile-zone days." /><MetricRow label="Active goal target" value={metric(target === null ? null : unit === "lb" ? kgToLb(target) : target, unit)} detail="A target is a reference, never a measured weight." />
      {!weights.data && weights.loading ? <LoadingSkeleton lines={2} /> : null}
      {weights.error ? <><ErrorNote message={errorMessage(weights.error)} /><Action secondary label="Refresh measured trend" onPress={weights.reload} /></> : null}
      {weights.data ? <><ObservedChart title="Recent measured weight" dots unit={unit} points={[...weights.data.items].sort((left, right) => Date.parse(left.recorded_at) - Date.parse(right.recorded_at)).map(row => ({ label: `${dateOnly(zone, new Date(row.recorded_at))} ${new Date(row.recorded_at).toLocaleTimeString(undefined, { timeZone: zone, hour: "2-digit", minute: "2-digit" })}`, value: Number(unit === "lb" ? kgToLb(row.weight_kg) : row.weight_kg), target: target === null ? null : Number(unit === "lb" ? kgToLb(target) : target) }))} />{weights.data.items.length === 60 ? <Copy>Showing the latest 60 measurements. Open weight history for earlier entries.</Copy> : null}</> : null}
      <Action secondary label="Open measured weight history" onPress={() => router.push("/tracking/weight")} />
    </Card>
  </>;
}
