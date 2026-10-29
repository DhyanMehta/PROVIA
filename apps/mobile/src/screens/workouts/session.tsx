import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { Action, AppText, Card, ConfirmDialog, Copy, EmptyState, ErrorNote, Field, NumberField, Page, SectionHeader, Title, Value } from "../../components/ui";
import { useResource } from "../../hooks/use-resource";
import { useMutation } from "../../hooks/use-mutation";
import { ApiError, errorMessage } from "../../lib/api-client";
import { useApi } from "../../providers/api";
import { activeWorkout, completionTimestamp, duration, elapsedSeconds, integerInput, pendingSets, setStatus, snapshotDay, titleOf, workout, workoutCheck, type Exercise, type Workout, type WorkoutSet } from "./data";
import { LoadState, MutationState, useRouteId } from "./common";
import { SetEditor } from "./set-editor";
import { ExercisePicker } from "./exercises";
import { StartWorkout } from "./start-workout";
import { useExerciseNames } from "./use-exercise-names";
import { useWorkoutDraftGuard } from "./draft-guard";

export function ActiveWorkoutScreen() {
  const api = useApi();
  const result = useResource(useCallback(signal => activeWorkout(api, signal), [api]));
  useEffect(() => { if (result.data) router.replace({ pathname: "/workouts/sessions/[sessionId]", params: { sessionId: result.data.id } }); }, [result.data]);
  return <Page><Title eyebrow="Workouts">Your active workout</Title><LoadState resource={result}>{!result.loading && result.data === null ? <><EmptyState title="Ready when you are" message="There is no active workout on your account." /><StartWorkout /></> : null}</LoadState></Page>;
}

export function WorkoutSessionScreen() {
  const sessionId = useRouteId("sessionId");
  const api = useApi();
  const result = useResource(useCallback(async signal => {
    const [session, profile] = await Promise.all([workout(api, sessionId, signal), api.request("get", "/api/v1/profile", { signal, validate: row => !!row && typeof row.timezone === "string" })]);
    return { session, timezone: profile.timezone };
  }, [api, sessionId]));
  return <Page refreshing={result.loading} onRefresh={result.reload}><LoadState resource={result}>{result.data ? <SessionBody key={sessionId} row={result.data.session} timezone={result.data.timezone} reload={result.reload} /> : <Title eyebrow="Workouts">Loading your workout</Title>}</LoadState></Page>;
}

function SessionBody({ row, timezone, reload }: { row: Workout; timezone: string; reload: () => void }) {
  const api = useApi();
  const [now, setNow] = useState(() => Date.now());
  const [picker, setPicker] = useState(false);
  const [editing, setEditing] = useState<{ exerciseId: string; name: string; set?: WorkoutSet } | null>(null);
  const [confirm, setConfirm] = useState<"complete" | "cancel" | WorkoutSet | null>(null);
  const [error, setError] = useState<string>();
  const mutation = useMutation();
  const scheduled = snapshotDay(row);
  const ids = [...new Set([...(scheduled?.exercises.map(item => item.exercise_id) ?? []), ...row.sets.map(item => item.exercise_id)])];
  const names = useExerciseNames(ids);
  const active = row.status === "in_progress";
  useEffect(() => { if (!active) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [active]);
  const nameOf = (id: string) => row.sets.find(set => set.exercise_id === id && set.exercise_name_snapshot)?.exercise_name_snapshot ?? names.data?.[id] ?? "Exercise name unavailable";
  const finish = async () => {
    const action = confirm;
    if (!action) return;
    try {
      if (action === "complete") {
        const completed_at = completionTimestamp(row);
        await mutation.run(async () => {
          const saved = await api.request("post", "/api/v1/workout-sessions/{session_id}/complete", { params: { session_id: row.id }, body: { completed_at }, validate: workoutCheck });
          setConfirm(null); reload(); return saved;
        });
      } else if (action === "cancel") {
        await mutation.run(async () => {
          const saved = await api.request("patch", "/api/v1/workout-sessions/{session_id}", { params: { session_id: row.id }, body: { status: "cancelled" }, validate: workoutCheck });
          setConfirm(null); reload(); return saved;
        });
      } else {
        await mutation.run(async () => {
          await api.request("delete", "/api/v1/workout-sessions/{session_id}/sets/{set_id}", { params: { session_id: row.id, set_id: action.id } });
          setConfirm(null); reload(); return true;
        });
      }
    } catch (failure) { setError(failure instanceof ApiError ? errorMessage(failure) : failure instanceof Error ? failure.message : "Check the workout before continuing."); setConfirm(null); }
  };
  const reconcile = async () => {
    try {
      await workout(api, row.id);
      mutation.reset(); setConfirm(null); reload();
    } catch (failure) { setError(errorMessage(failure)); }
  };
  const choose = (exercise: Exercise) => { setEditing({ exerciseId: exercise.id, name: exercise.name }); setPicker(false); };
  return <>
    <Title eyebrow={active ? "Workout in progress" : row.status === "completed" ? "Workout complete" : "Workout cancelled"}>{titleOf(row)}</Title>
    <Card><Value label={active ? "Elapsed time" : "Recorded duration"} value={duration(elapsedSeconds(row, now))} /><Copy>Started {new Date(row.started_at).toLocaleString(undefined, { timeZone: timezone })} · {timezone}</Copy>{row.completed_at ? <Copy>Completed {new Date(row.completed_at).toLocaleString(undefined, { timeZone: timezone })}</Copy> : null}<Copy>{row.sets.filter(set => set.is_completed).length} completed · {row.sets.filter(set => set.is_skipped).length} skipped · {pendingSets(row)} pending sets</Copy></Card>
    {!active ? <Copy>This saved session is read-only. Its exercise and plan snapshots preserve the training you recorded.</Copy> : null}
    <SessionNotes row={row} disabled={!active || mutation.pending || mutation.uncertain} onSaved={reload} />
    <ErrorNote message={error} /><MutationState mutation={mutation} onReconcile={() => { void reconcile(); }} />
    {names.error ? <Copy>Some catalog names are unavailable. Recorded exercise names and sets remain visible.</Copy> : null}
    {scheduled ? <Card><SectionHeader title="Original plan targets" description="The start-time snapshot is preserved even if your plan changes." />{scheduled.exercises.map(item => <Copy key={item.id}>{nameOf(item.exercise_id)} · {item.target_sets} × {item.target_reps}{item.target_weight_kg === null ? "" : ` · ${item.target_weight_kg} kg`}{item.rest_seconds === null ? "" : ` · ${item.rest_seconds}s rest`}</Copy>)}</Card> : null}
    {ids.map(exerciseId => <Card key={exerciseId}><SectionHeader title={nameOf(exerciseId)} />{row.sets.filter(set => set.exercise_id === exerciseId).sort((a, b) => a.set_number - b.set_number).map(set => <Card key={set.id}><AppText variant="label">Set {set.set_number} · {setStatus(set)} · {set.kind}</AppText><Value label="Recorded performance" value={`${set.reps} reps · ${set.weight_kg} kg`} />{set.duration_seconds !== null ? <Copy>Duration {duration(set.duration_seconds)}</Copy> : null}{set.rest_seconds !== null ? <Copy>Planned rest {set.rest_seconds}s</Copy> : null}{set.notes ? <Copy>{set.notes}</Copy> : null}{active ? <><Action label={`Edit set ${set.set_number} of ${nameOf(exerciseId)}`} secondary disabled={!!editing || mutation.pending || mutation.uncertain} onPress={() => setEditing({ exerciseId, name: nameOf(exerciseId), set })} /><Action label={`Delete set ${set.set_number} of ${nameOf(exerciseId)}`} variant="quiet" disabled={!!editing || mutation.pending || mutation.uncertain} onPress={() => setConfirm(set)} /></> : null}</Card>)}{active ? <Action label={`Add set for ${nameOf(exerciseId)}`} secondary disabled={!!editing || mutation.pending || mutation.uncertain} onPress={() => setEditing({ exerciseId, name: nameOf(exerciseId) })} /> : null}</Card>)}
    {editing && active ? <SetEditor key={`${editing.exerciseId}:${editing.set?.id ?? "new"}`} session={row} exerciseId={editing.exerciseId} exerciseName={editing.name} row={editing.set} target={scheduled?.exercises.find(item => item.exercise_id === editing.exerciseId)} onSaved={() => { setEditing(null); reload(); }} onClose={() => setEditing(null)} /> : null}
    {active ? <>
      {ids.length === 0 ? <EmptyState title="Choose your first exercise" message="Log actual sets, repetitions and weights. Duration-only workouts can also be completed without sets." /> : null}
      <Action label="Add another exercise" secondary disabled={!!editing || mutation.pending || mutation.uncertain} onPress={() => setPicker(true)} />
      {picker ? <ExercisePicker onSelect={choose} onClose={() => setPicker(false)} /> : null}
      <RestTimer />
      <Action label="Complete workout" disabled={!!editing || mutation.pending || mutation.uncertain || pendingSets(row) > 0} onPress={() => setConfirm("complete")} />
      {pendingSets(row) ? <Copy>Complete or skip every pending set before finishing.</Copy> : null}
      <Action label="Cancel workout" variant="danger" disabled={!!editing || mutation.pending || mutation.uncertain} onPress={() => setConfirm("cancel")} />
    </> : <Action label="View recorded training progress" secondary onPress={() => router.push("/workouts/progress")} />}
    <ConfirmDialog visible={!!confirm} title={confirm === "complete" ? "Complete this workout?" : confirm === "cancel" ? "Cancel this workout?" : "Delete this set?"} message={confirm === "complete" ? "The saved session and its sets become read-only. Only recorded performance contributes to progress." : confirm === "cancel" ? "This session will be marked cancelled, preserving its recorded history." : "This incorrect set will be permanently removed from the active session."} confirmLabel={confirm === "complete" ? "Complete workout" : confirm === "cancel" ? "Cancel workout" : "Delete set"} destructive={confirm !== "complete"} busy={mutation.pending} onCancel={() => setConfirm(null)} onConfirm={() => { void finish(); }} />
  </>;
}

function SessionNotes({ row, disabled, onSaved }: { row: Workout; disabled: boolean; onSaved: () => void }) {
  const api = useApi();
  const mutation = useMutation();
  const [notes, setNotes] = useState(row.notes ?? "");
  const [baseline, setBaseline] = useState(row.notes ?? "");
  const guard = useWorkoutDraftGuard(notes !== baseline, mutation.pending, mutation.uncertain);
  if (row.status !== "in_progress") return row.notes ? <Card><SectionHeader title="Workout notes" /><Copy>{row.notes}</Copy></Card> : null;
  return <Card>{guard.dialog}<Field label="Workout notes" multiline value={notes} onChangeText={setNotes} maxLength={4000} editable={!disabled && !mutation.pending && !mutation.uncertain} /><MutationState mutation={mutation} onReconcile={() => { void workout(api, row.id).then(saved => { setNotes(saved.notes ?? ""); setBaseline(saved.notes ?? ""); mutation.reset(); onSaved(); }).catch(() => {}); }} /><Action label="Save workout notes" secondary loading={mutation.pending} disabled={disabled || mutation.uncertain} onPress={() => { const body = { notes: notes.trim() || null }; void mutation.run(async () => { const saved = await api.request("patch", "/api/v1/workout-sessions/{session_id}", { params: { session_id: row.id }, body, validate: workoutCheck }); setBaseline(saved.notes ?? ""); onSaved(); return saved; }); }} /></Card>;
}

function RestTimer() {
  const [seconds, setSeconds] = useState("90");
  const [target, setTarget] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string>();
  useEffect(() => { if (target === null) return; const timer = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(timer); }, [target]);
  return <Card><SectionHeader title="Rest timer" description="A local timer for this screen; it clears when you leave. Your workout elapsed time is restored from the saved session." /><NumberField label="Rest duration (seconds)" value={seconds} onChangeText={setSeconds} /><ErrorNote message={error} />{target !== null ? <Value label={now >= target ? "Rest finished" : "Time remaining"} value={duration(Math.max(0, Math.ceil((target - now) / 1000)))} /> : null}<Action label={target === null ? "Start rest timer" : "Restart rest timer"} secondary onPress={() => { try { const value = integerInput(seconds, "Rest seconds", 1, 86400); const instant = Date.now(); setNow(instant); setTarget(instant + value * 1000); setError(undefined); } catch (failure) { setError(failure instanceof Error ? failure.message : "Check the timer duration."); } }} />{target !== null ? <Action label="Clear rest timer" secondary onPress={() => setTarget(null)} /> : null}</Card>;
}
