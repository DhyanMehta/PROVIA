import { useCallback, useRef, useState } from "react";
import { router } from "expo-router";
import { Action, AppText, Card, Copy, ErrorNote, Field, NumberField, Page, SelectField, Title } from "../../components/ui";
import { useResource } from "../../hooks/use-resource";
import { useMutation } from "../../hooks/use-mutation";
import { errorMessage } from "../../lib/api-client";
import { useApi } from "../../providers/api";
import { exercise, plan, planCheck, weekdays, type Plan, type Exercise } from "./data";
import { inputError, LoadState, MutationState, useRouteId } from "./common";
import { ExercisePicker } from "./exercises";
import { moveExercise, planBody, planDraft, type DayDraft, type PlannedDraft } from "./plan-draft";
import { useExerciseNames } from "./use-exercise-names";
import { useWorkoutDraftGuard } from "./draft-guard";

export function PlanBuilderScreen({ editing = false }: { editing?: boolean }) {
  const api = useApi();
  const planId = useRouteId("planId");
  const exerciseId = useRouteId("exerciseId");
  const result = useResource(useCallback(async signal => ({ plan: editing ? await plan(api, planId, signal) : undefined, selected: exerciseId ? await exercise(api, exerciseId, signal) : undefined }), [api, editing, planId, exerciseId]));
  return <Page><Title eyebrow="Workout plans">{editing ? "Edit your training week" : "Build your training week"}</Title><Copy>Choose scheduled days, exercises and targets. Unscheduled days stay open.</Copy><LoadState resource={result}>{result.data ? <PlanBuilder key={result.data.plan?.id ?? "new"} row={result.data.plan} selected={result.data.selected} /> : null}</LoadState></Page>;
}
function PlanBuilder({ row, selected }: { row?: Plan; selected?: Exercise }) {
  const api = useApi();
  const [draft, setDraft] = useState(() => planDraft(row));
  const [selectedDay, setSelectedDay] = useState(0);
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState<string>();
  const sequence = useRef(0);
  const mutation = useMutation();
  const locked = mutation.pending || mutation.uncertain;
  const [baseline] = useState(() => JSON.stringify(planDraft(row)));
  const guard = useWorkoutDraftGuard(JSON.stringify(draft) !== baseline, mutation.pending, mutation.uncertain);
  const day = draft.days[selectedDay];
  const names = useExerciseNames(day.exercises.map(item => item.exerciseId));
  const updateDay = (value: DayDraft) => setDraft(previous => ({ ...previous, days: previous.days.map((item, index) => index === selectedDay ? value : item) }));
  const add = (item: Exercise) => {
    if (item.is_archived) { setError("Archived exercises cannot be added to new schedules."); return; }
    if (day.exercises.length >= 50) { setError("A day supports up to 50 exercises."); return; }
    updateDay({ ...day, enabled: true, isRest: false, exercises: [...day.exercises, { key: `draft-${++sequence.current}`, exerciseId: item.id, name: item.name, sets: "3", reps: "8", weight: "", rest: "90", notes: "" }] });
    setPicker(false);
  };
  const save = () => { try {
    const body = planBody(draft);
    void mutation.run(async key => {
      const saved = row ? await api.request("patch", "/api/v1/workout-plans/{plan_id}", { params: { plan_id: row.id }, body, validate: planCheck }) : await api.request("post", "/api/v1/workout-plans", { body, idempotencyKey: key, validate: planCheck });
      guard.allowLeave();
      router.replace({ pathname: "/workouts/plans/[planId]", params: { planId: saved.id } });
      return saved;
    }, { idempotent: !row });
  } catch (e) { setError(inputError(e)); } };
  const reconcile = async () => {
    if (!row) return;
    try {
      const actual = await plan(api, row.id, undefined, true);
      if (JSON.stringify(planBody(planDraft(actual))) === JSON.stringify(planBody(draft))) {
        guard.allowLeave();
        router.replace({ pathname: "/workouts/plans/[planId]", params: { planId: row.id } });
        return;
      }
      mutation.reset();
      setError(`The latest saved plan is “${actual.name}” with ${actual.days.length} scheduled days. It differs from this draft. Your draft is retained; review before explicitly replacing the complete schedule.`);
    } catch (failure) { setError(inputError(failure)); }
  };
  return <>{guard.dialog}<Field editable={!locked} label="Plan name" value={draft.name} onChangeText={name => setDraft({ ...draft, name })} maxLength={200} /><Field editable={!locked} label="Plan description" multiline value={draft.description} onChangeText={description => setDraft({ ...draft, description })} maxLength={4000} /><Field editable={!locked} label="Training goal (optional)" value={draft.goal} onChangeText={goal => setDraft({ ...draft, goal })} maxLength={200} /><SelectField disabled={locked} label="Plan activation" value={draft.isActive ? "active" : "inactive"} options={[{ label: "Active plan", value: "active" }, { label: "Inactive plan", value: "inactive" }]} onValueChange={value => setDraft({ ...draft, isActive: value === "active" })} hint="Activating this plan deactivates your previous active plan." />
    <Card><AppText variant="heading">Weekly schedule</AppText>{draft.days.map((item, index) => <Copy key={index}>{weekdays[index]}: {item.enabled ? item.isRest ? "Rest" : `${item.name} · ${item.exercises.length} exercises` : "Unscheduled"}</Copy>)}<SelectField disabled={locked} label="Edit day" value={selectedDay} options={weekdays.map((label, value) => ({ label, value }))} onValueChange={value => { setSelectedDay(value); setPicker(false); }} /></Card>
    <Card><AppText variant="heading">{weekdays[selectedDay]}</AppText><SelectField disabled={locked} label="Day type" value={!day.enabled ? "off" : day.isRest ? "rest" : "training"} options={[{ label: "Unscheduled", value: "off" }, { label: "Training", value: "training" }, { label: "Rest", value: "rest" }]} onValueChange={value => { if (value === "rest" && day.exercises.length) { setError("Remove exercises from this day before making it a rest day."); return; } updateDay({ ...day, enabled: value !== "off", isRest: value === "rest" }); }} />
      {day.enabled ? <Field editable={!locked} label="Day name" value={day.name} onChangeText={name => updateDay({ ...day, name })} maxLength={100} /> : null}
      {day.enabled && !day.isRest ? <>{day.exercises.map((item, index) => <PlannedExerciseEditor disabled={locked} key={item.key} item={item} index={index} count={day.exercises.length} name={item.name || names.data?.[item.exerciseId] || "Exercise details loading…"} onChange={value => updateDay({ ...day, exercises: day.exercises.map((entry, position) => position === index ? value : entry) })} onMove={direction => updateDay(moveExercise(day, index, direction))} onRemove={() => updateDay({ ...day, exercises: day.exercises.filter((_, position) => position !== index) })} />)}<Action label="Add exercise to this day" disabled={locked} secondary onPress={() => setPicker(true)} />{selected ? <Action label={`Add selected ${selected.name} to ${weekdays[selectedDay]}`} disabled={locked} onPress={() => add(selected)} secondary /> : null}</> : null}
    </Card>{picker ? <ExercisePicker onSelect={add} onClose={() => setPicker(false)} /> : null}
    {names.error ? <ErrorNote message={errorMessage(names.error)} /> : null}<ErrorNote message={error} /><MutationState mutation={mutation} canRetry={!row} onReconcile={() => { void reconcile(); }} /><Action label="Save complete workout plan" onPress={save} loading={mutation.pending} disabled={mutation.uncertain} /><Copy>Your draft remains here if saving fails. Leaving this screen discards unsaved changes.</Copy></>;
}
function PlannedExerciseEditor({ item, name, index, count, disabled, onChange, onMove, onRemove }: { item: PlannedDraft; name: string; index: number; count: number; disabled: boolean; onChange: (item: PlannedDraft) => void; onMove: (direction: -1 | 1) => void; onRemove: () => void }) {
  const prefix = `Exercise ${index + 1}`;
  return <Card><AppText variant="heading">{index + 1}. {name}</AppText><NumberField editable={!disabled} label={`${prefix} target sets`} value={item.sets} onChangeText={sets => onChange({ ...item, sets })} /><NumberField editable={!disabled} label={`${prefix} target reps`} value={item.reps} onChangeText={reps => onChange({ ...item, reps })} /><NumberField editable={!disabled} label={`${prefix} target weight (kg)`} value={item.weight} onChangeText={weight => onChange({ ...item, weight })} hint="Optional; zero is valid for bodyweight training." /><NumberField editable={!disabled} label={`${prefix} rest seconds`} value={item.rest} onChangeText={rest => onChange({ ...item, rest })} /><Field editable={!disabled} label={`${prefix} notes`} value={item.notes} onChangeText={notes => onChange({ ...item, notes })} maxLength={4000} /><Action label={`Move exercise ${index + 1} up`} secondary disabled={disabled || index === 0} onPress={() => onMove(-1)} /><Action label={`Move exercise ${index + 1} down`} secondary disabled={disabled || index === count - 1} onPress={() => onMove(1)} /><Action label={`Remove exercise ${index + 1}`} variant="quiet" disabled={disabled} onPress={onRemove} /></Card>;
}
