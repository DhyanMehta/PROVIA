import { useRef, useState } from "react";
import { Action, AppText, Card, Copy, ErrorNote, Field, NumberField, SelectField } from "../../components/ui";
import { useMutation } from "../../hooks/use-mutation";
import { decimalInput } from "../../lib/form-values";
import { useApi } from "../../providers/api";
import { integerInput, sameSet, setCheck, workout, type SetInput, type Workout, type WorkoutSet } from "./data";
import { inputError, MutationState } from "./common";
import { useWorkoutDraftGuard } from "./draft-guard";

export function SetEditor({ session, exerciseId, exerciseName, row, target, onSaved, onClose }: { session: Workout; exerciseId: string; exerciseName: string; row?: WorkoutSet; target?: { target_reps: number; target_weight_kg: string | null; rest_seconds: number | null }; onSaved: () => void; onClose: () => void }) {
  const api = useApi();
  const mutation = useMutation();
  const [number, setNumber] = useState(String(row?.set_number ?? Math.max(0, ...session.sets.filter(item => item.exercise_id === exerciseId).map(item => item.set_number)) + 1));
  const [reps, setReps] = useState(String(row?.reps ?? target?.target_reps ?? 0));
  const [weight, setWeight] = useState(row?.weight_kg ?? target?.target_weight_kg ?? "0");
  const [kind, setKind] = useState(row?.kind ?? "working");
  const [state, setState] = useState(row?.is_skipped ? "skipped" : row?.is_completed ? "completed" : "pending");
  const [seconds, setSeconds] = useState(row?.duration_seconds === undefined || row.duration_seconds === null ? "" : String(row.duration_seconds));
  const [rest, setRest] = useState(row ? row.rest_seconds === null ? "" : String(row.rest_seconds) : target?.rest_seconds === undefined || target.rest_seconds === null ? "" : String(target.rest_seconds));
  const [notes, setNotes] = useState(row?.notes ?? "");
  const [error, setError] = useState<string>();
  const [reconciling, setReconciling] = useState(false);
  const sent = useRef<SetInput | null>(null);
  const fields = JSON.stringify([number, reps, weight, kind, state, seconds, rest, notes]);
  const [baseline] = useState(fields);
  const guard = useWorkoutDraftGuard(fields !== baseline, mutation.pending || reconciling, mutation.uncertain);
  const reconcile = async () => {
    if (reconciling || !sent.current) return;
    setReconciling(true);
    try {
      const actual = await workout(api, session.id);
      const input = sent.current;
      const saved = actual.sets.find(item => row ? item.id === row.id : item.exercise_id === input.exercise_id && item.set_number === input.set_number);
      if (saved && sameSet(saved, input)) { guard.allowLeave(); onSaved(); return; }
      if (actual.status !== "in_progress") { setError("This workout is now finished. Your draft cannot be saved; reload the workout."); guard.allowLeave(); onSaved(); return; }
      mutation.reset();
      setError(saved ? "The saved set differs from this draft. Review its values in the workout before deciding whether to save this correction." : "No matching set was saved. Your draft is retained; you can explicitly save it again.");
      // Never resend a POST over an existing conflicting tuple.
      if (!row && saved) { guard.allowLeave(); onSaved(); return; }
    } catch (e) { setError(inputError(e)); }
    finally { setReconciling(false); }
  };
  const save = () => {
    try {
      const input: SetInput = { exercise_id: exerciseId, set_number: integerInput(number, "Set number", 1, 1000), reps: integerInput(reps, "Repetitions", 0, 10000), weight_kg: decimalInput(weight, "Weight", 0, 10000), kind: kind === "warmup" ? "warmup" : "working", is_completed: state === "completed", is_skipped: state === "skipped", duration_seconds: seconds.trim() ? integerInput(seconds, "Duration", 0, 86400) : null, rest_seconds: rest.trim() ? integerInput(rest, "Rest", 0, 86400) : null, notes: notes.trim() || null };
      if (input.is_completed && input.reps === 0 && !input.duration_seconds) throw new Error("A completed set needs repetitions or a positive duration.");
      if (session.sets.some(item => item.id !== row?.id && item.exercise_id === exerciseId && item.set_number === input.set_number)) throw new Error("This exercise already has that set number. Edit the recorded set or choose a different number.");
      sent.current = input;
      void mutation.run(async () => {
        const { exercise_id: _exerciseId, ...patch } = input;
        const saved = row ? await api.request("patch", "/api/v1/workout-sessions/{session_id}/sets/{set_id}", { params: { session_id: session.id, set_id: row.id }, body: patch, validate: setCheck }) : await api.request("post", "/api/v1/workout-sessions/{session_id}/sets", { params: { session_id: session.id }, body: input, validate: setCheck });
        guard.allowLeave(); onSaved(); return saved;
      });
    } catch (e) { setError(inputError(e)); }
  };
  return <Card>{guard.dialog}<AppText variant="heading">{row ? "Edit" : "Log"} set · {exerciseName}</AppText><NumberField label="Set number" value={number} onChangeText={setNumber} /><NumberField label="Repetitions" value={reps} onChangeText={setReps} /><NumberField label="Weight (kg)" value={weight} onChangeText={setWeight} hint="Zero is valid for bodyweight or duration-based exercises." /><SelectField label="Set kind" value={kind} options={[{ label: "Working", value: "working" }, { label: "Warmup", value: "warmup" }]} onValueChange={setKind} /><SelectField label="Set status" value={state} options={[{ label: "Pending", value: "pending" }, { label: "Completed", value: "completed" }, { label: "Skipped", value: "skipped" }]} onValueChange={setState} /><NumberField label="Duration in seconds (optional)" value={seconds} onChangeText={setSeconds} /><NumberField label="Rest in seconds (optional)" value={rest} onChangeText={setRest} /><Field label="Set notes" multiline maxLength={4000} value={notes} onChangeText={setNotes} /><ErrorNote message={error} /><MutationState mutation={mutation} onReconcile={() => { void reconcile(); }} />{reconciling ? <Copy>Checking the saved workout…</Copy> : null}<Action label="Save set" onPress={save} loading={mutation.pending} disabled={mutation.uncertain || reconciling} /><Action label="Close set editor" secondary onPress={() => guard.requestLeave(onClose)} disabled={mutation.pending || mutation.uncertain || reconciling} /></Card>;
}
