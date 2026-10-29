import { useRef, useState } from "react";
import { Action, Card, ConfirmDialog, Copy, ErrorNote, Field, SectionHeader, SelectField, Value } from "../components/ui";
import { useMutation } from "../hooks/use-mutation";
import { ApiError, errorMessage } from "../lib/api-client";
import { metric } from "../lib/format";
import { useApi } from "../providers/api";
import { activityLevels, calculationData, friendly, goalData, goalTypes, profileData, profileInput } from "../lib/profile-values";
import { useProfileDraftGuard } from "./profile-draft";
import { decimalInput, decimalText, kgToLb, lbToKg } from "../lib/form-values";
import type { Schema } from "../lib/contracts";

function usePreviewWork() {
  const running = useRef(false);
  const [pending, setPending] = useState(false);
  async function run(operation: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setPending(true);
    try { await operation(); } finally { running.current = false; setPending(false); }
  }
  return { pending, run };
}

export function MutationError({ mutation, onReconcile }: { mutation: ReturnType<typeof useMutation>; onReconcile: () => Promise<unknown> }) {
  return <>{mutation.error ? <ErrorNote message={errorMessage(mutation.error)} /> : null}{mutation.uncertain ? <Card><Copy>The save result is unknown. Check the saved record before making another change.</Copy><Action label="Reload saved data to reconcile" onPress={() => { void onReconcile().then(() => mutation.reset()).catch(() => {}); }} /></Card> : null}</>;
}
function Targets({ value }: { value: Schema<"GoalCalculationOut"> }) {
  return <Card><Value label="Daily calorie target" value={metric(value.daily_calorie_target, "kcal")} />{(["protein", "carbs", "fat", "fiber"] as const).map(key => <Value key={key} label={friendly(key)} value={metric(value[`${key}_target_g`], "g")} />)}</Card>;
}
export function ProfileEditor({ profile, active, onSaved, onCancel }: { profile: Schema<"ProfileOut">; active: Schema<"GoalOut"> | null; onSaved: () => void; onCancel: () => void }) {
  const api = useApi(), mutation = useMutation(), previewWork = usePreviewWork();
  const [name, setName] = useState(profile.display_name), [height, setHeight] = useState(profile.height_cm), [unit, setUnit] = useState(profile.preferred_weight_unit);
  const initialWeight = profile.preferred_weight_unit === "lb" ? kgToLb(profile.current_weight_kg) : profile.current_weight_kg;
  const [weight, setWeight] = useState(initialWeight), [dob, setDob] = useState(profile.date_of_birth ?? ""), [zone, setZone] = useState(profile.timezone), [activity, setActivity] = useState(profile.activity_level);
  const [error, setError] = useState(""), [review, setReview] = useState<{ body: Schema<"ProfilePut">; preview?: Schema<"GoalCalculationOut"> }>();
  const [discard, setDiscard] = useState(false);
  const dirty = name !== profile.display_name || height !== profile.height_cm || unit !== profile.preferred_weight_unit || weight !== initialWeight || dob !== (profile.date_of_birth ?? "") || zone !== profile.timezone || activity !== profile.activity_level;
  const guard = useProfileDraftGuard(dirty || mutation.uncertain, mutation.pending);
  async function prepare() {
    try {
      const current_weight_kg = weight === initialWeight && unit === profile.preferred_weight_unit ? profile.current_weight_kg : unit === "lb" ? lbToKg(weight) : weight;
      const body = profileInput({ display_name: name, height_cm: height, current_weight_kg, date_of_birth: dob || null, activity_level: activity, timezone: zone, preferred_weight_unit: unit });
      let preview: Schema<"GoalCalculationOut"> | undefined;
      if (Number(body.current_weight_kg) !== Number(profile.current_weight_kg) && active?.target_weight_kg && active.selected_deficit_kcal) preview = await api.request("post", "/api/v1/nutrition/calculate-goals", { authenticated: false, body: { current_weight_kg: body.current_weight_kg, target_weight_kg: active.target_weight_kg, deficit_kcal: active.selected_deficit_kcal }, validate: calculationData });
      setReview({ body, preview }); setError("");
    } catch (failure) { setError(failure instanceof ApiError ? errorMessage(failure) : (failure as Error).message); }
  }
  return <Card><SectionHeader title="Edit complete profile" description="All supported fields are retained in this replacement. Changing profile weight may create a new active goal revision." />
    <Field label="Display name" value={name} onChangeText={setName} maxLength={100} /><Field label="Height (cm)" value={height} onChangeText={setHeight} keyboardType="decimal-pad" /><Field label={`Profile weight (${unit})`} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
    <SelectField label="Preferred weight unit" value={unit} options={[{ label: "Kilograms", value: "kg" }, { label: "Pounds", value: "lb" }]} onValueChange={value => { if (unit !== value) { try { setWeight(value === "lb" ? kgToLb(weight) : lbToKg(weight)); setUnit(value); } catch { setError("Enter a valid weight before changing units."); } } }} />
    <Field label="Date of birth (YYYY-MM-DD, optional)" value={dob} onChangeText={setDob} maxLength={10} /><Field label="Time zone" value={zone} onChangeText={setZone} autoCapitalize="none" autoCorrect={false} /><SelectField label="Activity level" value={activity} options={activityLevels.map(value => ({ label: friendly(value), value }))} onValueChange={setActivity} />
    {error ? <ErrorNote message={error} /> : null}<Action label="Review profile changes" loading={previewWork.pending} disabled={mutation.pending || mutation.uncertain || previewWork.pending} onPress={() => { void previewWork.run(prepare); }} /><Action secondary label="Cancel editing" disabled={mutation.pending || mutation.uncertain} onPress={() => dirty ? setDiscard(true) : onCancel()} />
    {review?.preview ? <Targets value={review.preview} /> : null}{review ? <ConfirmDialog visible title="Save profile changes?" message={Number(review.body.current_weight_kg) !== Number(profile.current_weight_kg) ? "This changes your profile weight. The server may create a new calculated goal revision; historical snapshots remain preserved." : "This saves your complete profile, including date of birth and preferences. Existing goal snapshots are preserved."} busy={mutation.pending} onCancel={() => setReview(undefined)} onConfirm={() => { void mutation.run(async () => { await api.request("put", "/api/v1/profile", { body: review.body, validate: profileData }); setReview(undefined); guard.allow(); onSaved(); }).then(() => setReview(undefined)); }} /> : null}
    <MutationError mutation={mutation} onReconcile={async () => { await api.request("get", "/api/v1/profile", { cacheMs: 0, validate: profileData }); guard.allow(); onSaved(); }} />
    {discard ? <ConfirmDialog visible title="Discard profile changes?" message="Your unsaved edits will be discarded." destructive onCancel={() => setDiscard(false)} onConfirm={() => { guard.allow(); onCancel(); }} /> : null}{guard.dialog}
  </Card>;
}
export function GoalEditor({ goal, unit = "kg", onSaved, onCancel }: { goal: Schema<"GoalOut">; unit?: "kg" | "lb"; onSaved: (goal: Schema<"GoalOut">) => void; onCancel: () => void }) {
  const api = useApi(), mutation = useMutation(), previewWork = usePreviewWork();
  const initialCurrent = goal.current_weight_kg_snapshot === null ? "" : unit === "lb" ? kgToLb(goal.current_weight_kg_snapshot) : goal.current_weight_kg_snapshot;
  const initialTarget = goal.target_weight_kg === null ? "" : unit === "lb" ? kgToLb(goal.target_weight_kg) : goal.target_weight_kg;
  const initialDeficit = decimalText(goal.selected_deficit_kcal ?? "0");
  const [type, setType] = useState(goal.goal_type), [current, setCurrent] = useState(initialCurrent), [target, setTarget] = useState(initialTarget), [deficit, setDeficit] = useState(initialDeficit), [steps, setSteps] = useState(goal.daily_steps_target === null ? "" : String(goal.daily_steps_target));
  const [review, setReview] = useState<{ body: Schema<"GoalPatch">; preview: Schema<"GoalCalculationOut"> }>(), [error, setError] = useState("");
  const [discard, setDiscard] = useState(false);
  const guard = useProfileDraftGuard(type !== goal.goal_type || current !== initialCurrent || target !== initialTarget || deficit !== initialDeficit || steps !== (goal.daily_steps_target === null ? "" : String(goal.daily_steps_target)) || mutation.uncertain, mutation.pending);
  async function preview() { try { const weight = decimalInput(current === initialCurrent && goal.current_weight_kg_snapshot ? goal.current_weight_kg_snapshot : unit === "lb" ? lbToKg(current) : current, "current weight", 0.001, 1000), targetWeight = decimalInput(target === initialTarget && goal.target_weight_kg ? goal.target_weight_kg : unit === "lb" ? lbToKg(target) : target, "target weight", 0.001, 1000), budget = decimalInput(deficit, "deficit", 0, 24000); if (steps && (!/^\d+$/.test(steps) || Number(steps) > 200000)) throw new Error("Enter whole daily steps from 0 to 200000, or leave blank to clear the target."); const body: Schema<"GoalPatch"> = { goal_type: type, current_weight_kg: weight, target_weight_kg: targetWeight, selected_deficit_kcal: budget, daily_steps_target: steps ? Number(steps) : null }; const result = await api.request("post", "/api/v1/nutrition/calculate-goals", { authenticated: false, body: { current_weight_kg: weight, target_weight_kg: targetWeight, deficit_kcal: budget }, validate: calculationData }); setReview({ body, preview: result }); setError(""); } catch (failure) { setError(failure instanceof ApiError ? errorMessage(failure) : (failure as Error).message); } }
  return <Card>{guard.dialog}{discard ? <ConfirmDialog visible title="Discard goal changes?" message="Your unsaved goal draft will be discarded. No revision is saved until you confirm its preview." destructive onCancel={() => setDiscard(false)} onConfirm={() => { guard.allow(); onCancel(); }} /> : null}<SectionHeader title="Review goal revision" description="Labels retain the existing backend formula. A confirmed calculation change returns a new goal ID." /><SelectField label="Goal type" value={type} onValueChange={setType} options={goalTypes.map(value => ({ label: friendly(value), value }))} /><Field label={`Goal current weight (${unit})`} value={current} onChangeText={setCurrent} keyboardType="decimal-pad" /><Field label={`Goal target weight (${unit})`} value={target} onChangeText={setTarget} keyboardType="decimal-pad" /><Field label="Daily calorie deficit" value={deficit} onChangeText={setDeficit} keyboardType="decimal-pad" /><Field label="Daily steps target (optional)" value={steps} onChangeText={setSteps} keyboardType="number-pad" />{error ? <ErrorNote message={error} /> : null}<Action label="Preview revised targets" loading={previewWork.pending} disabled={mutation.pending || mutation.uncertain || previewWork.pending} onPress={() => { void previewWork.run(preview); }} /><Action secondary label="Cancel goal editing" disabled={mutation.pending || mutation.uncertain} onPress={() => setDiscard(true)} />{review ? <><Targets value={review.preview} /><ConfirmDialog visible title="Save this goal revision?" message="The server saves a new revision and preserves historical goals. Its returned ID becomes the selected goal." busy={mutation.pending} onCancel={() => setReview(undefined)} onConfirm={() => { void mutation.run(async () => { const revised = await api.request("patch", "/api/v1/goals/{goal_id}", { params: { goal_id: goal.id }, body: review.body, validate: goalData }); setReview(undefined); guard.allow(); onSaved(revised); }).then(() => setReview(undefined)); }} /></> : null}<MutationError mutation={mutation} onReconcile={async () => { await api.request("get", "/api/v1/goals", { cacheMs: 0, query: { limit: 20, offset: 0 }, validate: value => !!value && Array.isArray(value.items) && value.items.every(goalData) }); guard.allow(); onCancel(); }} /></Card>;
}
