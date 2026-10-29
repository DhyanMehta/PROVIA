import type { Schema } from "../../lib/contracts";
import { decimalInput } from "../../lib/form-values";
import { integerInput, weekdays, type Plan, type PlannedInput } from "./data";

export type PlannedDraft = { key: string; exerciseId: string; name: string; sets: string; reps: string; weight: string; rest: string; notes: string };
export type DayDraft = { enabled: boolean; name: string; isRest: boolean; exercises: PlannedDraft[] };
export type PlanDraft = { name: string; description: string; goal: string; isActive: boolean; days: DayDraft[] };
export function planDraft(row?: Plan): PlanDraft {
  return { name: row?.name ?? "", description: row?.description ?? "", goal: row?.goal ?? "", isActive: row?.is_active ?? true, days: weekdays.map((name, dayIndex) => {
    const day = row?.days.find(item => item.day_of_week === dayIndex);
    return { enabled: !!day, name: day?.name ?? name, isRest: day?.is_rest ?? false, exercises: [...day?.exercises ?? []].sort((a, b) => a.order_index - b.order_index).map(item => ({ key: item.id, exerciseId: item.exercise_id, name: "", sets: String(item.target_sets), reps: String(item.target_reps), weight: item.target_weight_kg ?? "", rest: item.rest_seconds === null ? "" : String(item.rest_seconds), notes: item.notes ?? "" })) };
  }) };
}
export function planBody(draft: PlanDraft): Schema<"PlanCreate"> {
  if (!draft.name.trim() || draft.name.trim().length > 200) throw new Error("Enter a plan name of 1 to 200 characters.");
  return { name: draft.name.trim(), description: draft.description.trim() || null, goal: draft.goal.trim() || null, is_active: draft.isActive, days: draft.days.flatMap((day, day_of_week) => {
    if (!day.enabled) return [];
    if (!day.name.trim() || day.name.trim().length > 100) throw new Error(`${weekdays[day_of_week]} needs a name of 1 to 100 characters.`);
    if (day.exercises.length > 50) throw new Error("A day supports up to 50 exercises.");
    if (day.isRest && day.exercises.length) throw new Error("Remove exercises before making a day a rest day.");
    const exercises: PlannedInput[] = day.exercises.map((item, order_index) => ({ exercise_id: item.exerciseId, order_index, target_sets: integerInput(item.sets, "Target sets", 1, 100), target_reps: integerInput(item.reps, "Target reps", 1, 10000), target_weight_kg: item.weight.trim() ? decimalInput(item.weight, "Target weight", 0, 10000) : null, rest_seconds: item.rest.trim() ? integerInput(item.rest, "Rest seconds", 0, 86400) : null, notes: item.notes.trim() || null }));
    return [{ day_of_week, name: day.name.trim(), is_rest: day.isRest, exercises }];
  }) };
}
export function moveExercise(day: DayDraft, index: number, direction: -1 | 1): DayDraft {
  const next = index + direction;
  if (index < 0 || next < 0 || index >= day.exercises.length || next >= day.exercises.length) return day;
  const exercises = [...day.exercises];
  [exercises[index], exercises[next]] = [exercises[next], exercises[index]];
  return { ...day, exercises };
}
