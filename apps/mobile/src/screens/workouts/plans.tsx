import { useCallback, useState } from "react";
import { router } from "expo-router";
import { Action, AppText, Card, ConfirmDialog, Copy, EmptyState, ErrorNote, Page, Title } from "../../components/ui";
import { ApiError } from "../../lib/api-client";
import { useResource } from "../../hooks/use-resource";
import { useMutation } from "../../hooks/use-mutation";
import { useApi } from "../../providers/api";
import { plan, planCheck, plans, weekdays } from "./data";
import { inputError, LoadState, MutationState, Pager, useRouteId } from "./common";
import { useExerciseNames } from "./use-exercise-names";
import { StartWorkout } from "./start-workout";

export function PlansScreen() {
  const api = useApi();
  const exerciseId = useRouteId("exerciseId");
  const [offset, setOffset] = useState(0);
  const result = useResource(useCallback(signal => plans(api, offset, signal), [api, offset]));
  return <Page refreshing={result.loading} onRefresh={result.reload}><Title eyebrow="Workouts">Your workout plans</Title>{exerciseId ? <Copy>Choose a plan, then choose the day to add this exercise.</Copy> : <Copy>Build your week around your training and recovery.</Copy>}<Action label="Create a workout plan" onPress={() => router.push({ pathname: "/workouts/plans/new", params: exerciseId ? { exerciseId } : {} })} /><LoadState resource={result}>{result.data?.items.map(row => <Card key={row.id}><AppText variant="heading">{row.name}</AppText><Copy>{row.is_active ? "Active plan" : "Inactive plan"} · {row.days.length} scheduled days</Copy><Action label={`${exerciseId ? "Add exercise to" : "Open"} ${row.name}`} secondary onPress={() => router.push(exerciseId ? { pathname: "/workouts/plans/[planId]/edit", params: { planId: row.id, exerciseId } } : { pathname: "/workouts/plans/[planId]", params: { planId: row.id } })} /></Card>)}{result.data?.items.length === 0 ? <EmptyState title="Your next week starts here" message="Create a plan with exercises, target sets and rest days." /> : null}{result.data ? <Pager offset={offset} count={result.data.items.length} onChange={setOffset} /> : null}</LoadState></Page>;
}
export function PlanScreen() {
  const planId = useRouteId("planId");
  const api = useApi();
  const result = useResource(useCallback(signal => plan(api, planId, signal), [api, planId]));
  const row = result.data;
  const names = useExerciseNames(row?.days.flatMap(day => day.exercises.map(item => item.exercise_id)) ?? []);
  const mutation = useMutation();
  const [confirm, setConfirm] = useState(false);
  const [operation, setOperation] = useState<"duplicate" | "activate" | "delete" | null>(null);
  const [reconcileError, setReconcileError] = useState<string>();
  const reconcile = async () => {
    try { await plan(api, planId, undefined, true); mutation.reset(); setConfirm(false); result.reload(); }
    catch (failure) {
      if (operation === "delete" && failure instanceof ApiError && failure.status === 404) { mutation.reset(); router.replace("/workouts/plans"); }
      else setReconcileError(inputError(failure));
    }
  };
  return <Page refreshing={result.loading} onRefresh={result.reload}><Title eyebrow="Workout plan">{row?.name ?? "Your plan"}</Title><LoadState resource={result}>{row ? <><Copy>{row.is_active ? "Active plan" : "Inactive plan"}{row.goal ? ` · ${row.goal}` : ""}</Copy>{row.description ? <Copy>{row.description}</Copy> : null}<Action label="Edit schedule and exercises" secondary onPress={() => router.push({ pathname: "/workouts/plans/[planId]/edit", params: { planId } })} />{!row.is_active ? <Action label="Make this your active plan" loading={mutation.pending && operation === "activate"} disabled={mutation.pending || mutation.uncertain} onPress={() => { setOperation("activate"); void mutation.run(async () => { const updated = await api.request("patch", "/api/v1/workout-plans/{plan_id}", { params: { plan_id: planId }, body: { is_active: true }, validate: planCheck }); result.reload(); return updated; }); }} /> : null}
    <ErrorNote message={reconcileError} /><MutationState mutation={mutation} canRetry={operation === "duplicate"} onReconcile={() => { void reconcile(); }} />
    {names.error ? <Copy>Some exercise names could not load. Exercise references and your schedule remain available.</Copy> : null}
    {row.days.length === 0 ? <EmptyState title="No scheduled days" message="Edit this plan to add training days, exercises and recovery days." /> : null}
    {[...row.days].sort((a, b) => a.day_of_week - b.day_of_week).map(day => <Card key={day.id}><AppText variant="heading">{weekdays[day.day_of_week]} · {day.name}</AppText>{day.is_rest ? <Copy>Rest day</Copy> : <>{[...day.exercises].sort((a, b) => a.order_index - b.order_index).map(item => <Card key={item.id}><AppText variant="label">{names.data?.[item.exercise_id] ?? "Loading exercise name…"}</AppText><Copy>{item.target_sets} sets × {item.target_reps} reps{item.target_weight_kg !== null ? ` · ${item.target_weight_kg} kg` : ""}{item.rest_seconds !== null ? ` · ${item.rest_seconds}s rest` : ""}</Copy>{item.notes ? <Copy>{item.notes}</Copy> : null}<Action label="Exercise details" secondary onPress={() => router.push({ pathname: "/workouts/exercises/[exerciseId]", params: { exerciseId: item.exercise_id } })} /></Card>)}<StartWorkout dayId={day.id} label={`Start ${day.name}`} /></>}</Card>)}
    <Action label="Duplicate plan" secondary loading={mutation.pending && operation === "duplicate"} disabled={mutation.pending || mutation.uncertain} onPress={() => { setOperation("duplicate"); void mutation.run(async key => { const copy = await api.request("post", "/api/v1/workout-plans/{plan_id}/duplicate", { params: { plan_id: planId }, idempotencyKey: key, validate: planCheck }); router.push({ pathname: "/workouts/plans/[planId]", params: { planId: copy.id } }); return copy; }, { idempotent: true }); }} />
    <Action label="Delete plan" variant="danger" disabled={mutation.pending || mutation.uncertain} onPress={() => setConfirm(true)} />
  </> : null}</LoadState><ConfirmDialog visible={confirm} title="Delete this plan?" message="The schedule will be removed. Existing workouts retain their original plan snapshot." confirmLabel="Delete plan" destructive busy={mutation.pending} onCancel={() => setConfirm(false)} onConfirm={() => { setOperation("delete"); void mutation.run(async () => { await api.request("delete", "/api/v1/workout-plans/{plan_id}", { params: { plan_id: planId } }); router.replace("/workouts/plans"); return true; }); }} /></Page>;
}
