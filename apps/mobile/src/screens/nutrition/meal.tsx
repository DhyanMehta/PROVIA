import { useCallback, useState } from "react";
import { router } from "expo-router";
import { Action, Card, ConfirmDialog, Copy, ErrorState, Field, LoadingSkeleton, NumberField, Page, SelectField, Title } from "../../components/ui";
import { useApi } from "../../providers/api";
import { useResource } from "../../hooks/use-resource";
import { useMutation } from "../../hooks/use-mutation";
import type { Schema } from "../../lib/contracts";
import { errorMessage } from "../../lib/api-client";
import { Back, FormError, mealKinds, mealOptions, MutationNote, Nutrients, useDraftGuard, useNutritionParams } from "./common";
import { foodCheck, mealCheck } from "./contracts";
import { mealPatch, type IngredientDraft } from "./forms";
import { FoodPicker } from "./search";
import { QuantityPreview } from "./food";

function ItemEditor({ item, index, disabled, onChange, onRemove }: { item: IngredientDraft; index: number; disabled: boolean; onChange: (value: string) => void; onRemove: () => void }) {
  const api = useApi();
  const load = useCallback((signal: AbortSignal) => api.request("get", "/api/v1/foods/{food_id}", { params: { food_id: item.food_id }, signal, validate: foodCheck }), [api, item.food_id]);
  const record = useResource(load);
  return <Card><Copy>{record.data?.name ?? item.name}</Copy><NumberField label={`Food ${index + 1} grams`} value={item.quantity_g} onChangeText={onChange} editable={!disabled} /><Action label={`Remove food ${index + 1}`} secondary disabled={disabled} onPress={onRemove} />{record.error ? <Copy>Catalog information is unavailable. Saved meal snapshots remain available below.</Copy> : null}</Card>;
}
export function MealEditor({ original }: { original: Schema<"MealOut"> }) {
  const api = useApi(), mutation = useMutation();
  const [baseline, setBaseline] = useState(original);
  const [kind, setKind] = useState<Schema<"MealCreate">["meal_type"]>(mealKinds.find(value => value === original.meal_type) ?? "snack");
  const [instant, setInstant] = useState(original.consumed_at), [notes, setNotes] = useState(original.notes ?? "");
  const [items, setItems] = useState<IngredientDraft[]>(original.items.map((row, index) => ({ food_id: row.food_id, name: `Saved food ${index + 1}`, quantity_g: row.quantity_g })));
  const [picking, setPicking] = useState(false), [confirmDelete, setConfirmDelete] = useState(false), [failure, setFailure] = useState<unknown>();
  const locked = mutation.pending || mutation.uncertain;
  const dirtyItems = items.length !== baseline.items.length || items.some((row, index) => row.food_id !== baseline.items[index].food_id || Number(row.quantity_g) !== Number(baseline.items[index].quantity_g));
  const guard = useDraftGuard(dirtyItems || kind !== baseline.meal_type || instant !== baseline.consumed_at || notes !== (baseline.notes ?? ""), mutation.uncertain, mutation.pending);
  async function save() { try { const body = mealPatch(baseline, kind, instant, notes, items); setFailure(undefined); await mutation.run(async () => { const saved = await api.request("patch", "/api/v1/meals/{meal_id}", { params: { meal_id: original.id }, body, validate: mealCheck }); setBaseline(saved); guard.allow(); router.replace({ pathname: "/nutrition/meal/[meal_id]", params: { meal_id: saved.id } }); return saved; }); } catch (error) { setFailure(error); } }
  async function reconcile() {
    try {
      const saved = await api.request("get", "/api/v1/meals/{meal_id}", { params: { meal_id: original.id }, cacheMs: 0, validate: mealCheck });
      // Explicitly replace the draft only after this user-requested positive read.
      setBaseline(saved); setKind(mealKinds.find(value => value === saved.meal_type) ?? "snack"); setInstant(saved.consumed_at); setNotes(saved.notes ?? "");
      setItems(saved.items.map((row, index) => ({ food_id: row.food_id, name: `Saved food ${index + 1}`, quantity_g: row.quantity_g })));
      setFailure(undefined); mutation.reset();
    } catch (error) { setFailure(error); }
  }
  async function remove() { setConfirmDelete(false); await mutation.run(async () => { await api.request("delete", "/api/v1/meals/{meal_id}", { params: { meal_id: original.id } }); guard.allow(); router.replace("/nutrition"); }); }
  if (picking) return <Page scroll={false}>{guard.dialog}<Title>Add a food</Title><Action label="Return to meal" secondary onPress={() => setPicking(false)} /><FoodPicker onSelect={food => { setItems(previous => [...previous, { food_id: food.id, name: food.name, quantity_g: "100" }]); setPicking(false); }} /></Page>;
  return <Page><Back /><Title>Edit meal</Title><Copy>Saved nutrition stays unchanged when only notes, time or category change. Replacing foods or quantities explicitly recalculates the complete meal from current catalog values.</Copy><Nutrients title="Saved meal nutrition" value={baseline.totals} /><SelectField label="Meal category" value={kind} options={mealOptions} onValueChange={setKind} disabled={locked} /><Field label="Consumed at (with UTC offset)" value={instant} onChangeText={setInstant} editable={!locked} autoCapitalize="none" /><Field label="Notes" value={notes} onChangeText={setNotes} editable={!locked} multiline maxLength={2000} />
    {items.map((item, index) => <ItemEditor key={`${item.food_id}-${index}`} item={item} index={index} disabled={locked} onChange={quantity_g => setItems(previous => previous.map((row, at) => at === index ? { ...row, quantity_g } : row))} onRemove={() => setItems(previous => previous.filter((_, at) => at !== index))} />)}
    <Action label="Add another food" secondary disabled={locked || items.length >= 100} onPress={() => setPicking(true)} />{dirtyItems ? <Copy>Saving this food list recalculates all nutrient snapshots. Individual food previews below come from the server; the saved meal response provides authoritative totals.</Copy> : null}{dirtyItems ? items.slice(0, 10).map((item, index) => /^\d+(\.\d{1,3})?$/.test(item.quantity_g) && Number(item.quantity_g) > 0 && Number(item.quantity_g) <= 100000 ? <QuantityPreview key={`${item.food_id}-${index}`} foodId={item.food_id} grams={item.quantity_g} /> : null) : null}
    {guard.dialog}<FormError error={failure} /><MutationNote mutation={mutation} /><Action label="Save meal changes" loading={mutation.pending} disabled={locked || !items.length} onPress={() => { void save(); }} />{mutation.uncertain ? <Action label="Reload saved meal to reconcile" secondary onPress={() => { void reconcile(); }} /> : null}<Action label="Delete meal" variant="danger" disabled={locked} onPress={() => setConfirmDelete(true)} /><ConfirmDialog visible={confirmDelete} title="Delete this meal?" message="This removes the saved meal and updates the affected daily totals." confirmLabel="Delete meal" destructive onConfirm={() => { void remove(); }} onCancel={() => setConfirmDelete(false)} busy={mutation.pending} /></Page>;
}
export default function MealDetailScreen() {
  const { mealId } = useNutritionParams();
  const api = useApi();
  const load = useCallback((signal: AbortSignal) => api.request("get", "/api/v1/meals/{meal_id}", { params: { meal_id: mealId ?? "" }, signal, cacheMs: 0, validate: mealCheck }), [api, mealId]);
  const resource = useResource(load);
  if (resource.data && resource.data.id === mealId) return <MealEditor key={resource.data.id} original={resource.data} />;
  return <Page><Back /><Title>Meal details</Title>{resource.error ? <ErrorState message={errorMessage(resource.error)} onRetry={resource.reload} /> : <LoadingSkeleton />}</Page>;
}
