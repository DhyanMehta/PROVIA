import { useCallback } from "react";
import { router } from "expo-router";
import { Action, AppText, Card, Copy, EmptyState, Page, SectionHeader, Title, Value } from "../../components/ui";
import { useResource } from "../../hooks/use-resource";
import { dashboardData } from "../../lib/fitness-contracts";
import { useApi } from "../../providers/api";
import { activePlan, activeWorkout, duration, summary, titleOf, weekdays } from "./data";
import { LoadState } from "./common";
import { StartWorkout } from "./start-workout";

export function WorkoutsScreen() {
  const api = useApi();
  const resource = useResource(useCallback(async signal => {
    const [active, plan, history, day] = await Promise.all([activeWorkout(api, signal), activePlan(api, signal), summary(api, {}, signal), api.request("get", "/api/v1/dashboard/today", { signal, validate: dashboardData })]);
    return { active, plan, history, day };
  }, [api]));
  const data = resource.data;
  const weekday = data ? (new Date(`${data.day.date}T12:00:00Z`).getUTCDay() + 6) % 7 : null;
  const scheduled = data?.plan?.days.find(day => day.day_of_week === weekday);
  return <Page refreshing={resource.loading} onRefresh={resource.reload}>
    <Title eyebrow="Workouts">Make today a strong one.</Title>
    <Copy>Your own schedule, recorded sets and observed progress.</Copy>
    <LoadState resource={resource}>
      {data?.active ? <Card><AppText variant="label" tone="accent">Workout in progress</AppText><AppText variant="heading">{titleOf(data.active)}</AppText><Copy>Started {new Date(data.active.started_at).toLocaleString(undefined, { timeZone: data.day.timezone })} · {data.active.sets.length} recorded sets</Copy><Action label="Resume active workout" onPress={() => router.push({ pathname: "/workouts/sessions/[sessionId]", params: { sessionId: data.active!.id } })} /></Card> : data ? <StartWorkout /> : null}
      {data ? <Card><SectionHeader title="Your schedule today" description={`${weekdays[weekday!]} · ${data.day.timezone}`} />{data.plan ? <><AppText variant="heading">{data.plan.name}</AppText>{scheduled ? <><Copy>{scheduled.is_rest ? "Scheduled rest day" : `${scheduled.name} · ${scheduled.exercises.length} planned exercises`}</Copy>{!scheduled.is_rest && !data.active ? <StartWorkout dayId={scheduled.id} label={`Start ${scheduled.name}`} /> : null}</> : <Copy>No workout is scheduled for this day.</Copy>}<Action label="View complete plan" secondary onPress={() => router.push({ pathname: "/workouts/plans/[planId]", params: { planId: data.plan!.id } })} /></> : <EmptyState title="Your week is open" message="Create a training plan or start an unplanned workout." />}</Card> : null}
      <Card><SectionHeader title="Your training" /><Action label="Exercise library" secondary onPress={() => router.push("/workouts/exercises")} /><Action label="Workout plans" secondary onPress={() => router.push("/workouts/plans")} /><Action label="Workout history" secondary onPress={() => router.push("/workouts/sessions")} /><Action label="Training progress and personal records" secondary onPress={() => router.push("/workouts/progress")} /></Card>
      {data ? <><SectionHeader title="Recent completed sessions" description={`${data.history.start_date} to ${data.history.end_date}`} />{data.history.history.slice(-5).reverse().map(row => <Card key={row.id}><AppText variant="heading">Completed workout</AppText><Copy>{new Date(row.started_at).toLocaleString(undefined, { timeZone: data.day.timezone })}</Copy><Value label="Recorded duration" value={duration(row.duration_seconds)} /><Action label="View workout summary" secondary onPress={() => router.push({ pathname: "/workouts/sessions/[sessionId]", params: { sessionId: row.id } })} /></Card>)}{data.history.history.length === 0 ? <EmptyState title="Training history starts with you" message="No completed workouts in this date range. Open workout history to view earlier sessions." /> : null}</> : null}
    </LoadState>
  </Page>;
}
export default WorkoutsScreen;
