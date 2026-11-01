import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { Action, AppText, Card, Copy, ErrorState, Field, LoadingSkeleton, NumberField, Page, PhotoContainer, SelectField, Title } from "../../components/ui";
import { useApi } from "../../providers/api";
import { useResource } from "../../hooks/use-resource";
import { useMutation } from "../../hooks/use-mutation";
import type { Schema } from "../../lib/contracts";
import { decimalInput, multiplyDecimal, offsetTimestamp } from "../../lib/form-values";
import { errorMessage } from "../../lib/api-client";
import { Back, FormError, mealOptions, MutationNote, Nutrients, useDraftGuard, useNutritionParams } from "./common";
import { foodCheck, mealCheck, quantityCheck } from "./contracts";

export function QuantityPreview({ foodId, grams }: { foodId: string; grams?: string }) {
  const api = useApi();
  const load = useCallback(async (signal: AbortSignal) => ({ grams, result: grams ? await api.request("get", "/api/v1/foods/{food_id}/nutrition", { params: { food_id: foodId }, query: { quantity_g: grams }, signal, validate: quantityCheck }) : undefined }), [api, foodId, grams]);
  const result = useResource(load);
  return <>{result.loading && grams ? <LoadingSkeleton lines={2} /> : null}{result.error ? <ErrorState message={errorMessage(result.error)} onRetry={result.reload} /> : null}{result.data && result.data.grams === grams && result.data.result ? <Nutrients title={`Nutrition for ${grams} g`} value={result.data.result} /> : null}</>;
}
export function FoodLog({ food }: { food: Schema<"FoodOut"> }) {
  const api = useApi();
  const params = useNutritionParams();
  const [kind, setKind] = useState<typeof params.kind>(params.kind);
  const [quantity, setQuantity] = useState("100");
  const [portion, setPortion] = useState("grams");
  const [count, setCount] = useState("1");
  const [instant, setInstant] = useState(() => new Date().toISOString());
  const [notes, setNotes] = useState("");
  const [failure, setFailure] = useState<unknown>();
  const [preview, setPreview] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const mutation = useMutation();
  const guard = useDraftGuard(dirty, mutation.uncertain, mutation.pending);
  const selected = food.portions.find(item => item.id === portion);
  useEffect(() => {
    const timer = setTimeout(() => { try { const grams = selected ? multiplyDecimal(selected.grams, decimalInput(count, "portion count", 0.001, 1000)) : quantity; setPreview(decimalInput(grams, "grams", 0.001, 100000)); setFailure(undefined); } catch (error) { setPreview(undefined); setFailure(error); } }, 300);
    return () => clearTimeout(timer);
  }, [quantity, count, selected]);
  const saved = (value: unknown) => { const meal = value as Schema<"MealOut">; guard.allow(); router.replace({ pathname: "/nutrition/meal/[meal_id]", params: { meal_id: meal.id } }); };
  const save = async () => {
    try {
      const item: Schema<"MealItemCreate"> = selected ? { food_id: food.id, portion_id: selected.id, portion_count: decimalInput(count, "portion count", 0.001, 1000) } : { food_id: food.id, quantity_g: decimalInput(quantity, "grams", 0.001, 100000) };
      // Freeze the timestamp and body before creating a receipt identity.
      const body: Schema<"MealCreate"> = { meal_type: kind, consumed_at: offsetTimestamp(instant), notes: notes.trim() || null, items: [item] };
      const value = await mutation.run(key => api.request("post", "/api/v1/meals", { body, idempotencyKey: key, validate: mealCheck }), { idempotent: true });
      if (value) saved(value);
    } catch (error) { setFailure(error); }
  };
  const locked = mutation.pending || mutation.uncertain;
  return <><Card><SelectField label="Meal" value={kind} options={mealOptions} onValueChange={value => { setDirty(true); setKind(value); }} disabled={locked} /><SelectField label="Quantity unit" value={portion} options={[{ label: "Grams", value: "grams" }, ...food.portions.map(item => ({ label: `${item.label} (${item.grams} g)`, value: item.id }))]} onValueChange={value => { setDirty(true); setPortion(value); }} disabled={locked} />
    {selected ? <><Copy>One recorded {selected.label} is {selected.grams} g for this food. Fractions use this measured conversion only.</Copy><SelectField label="Quick measured count" value={count} options={[...(!["0.25", "0.5", "1", "1.5", "2"].includes(count) ? [{ label: "Custom count", value: count }] : []), ...[{ label: "¼", value: "0.25" }, { label: "½", value: "0.5" }, { label: "1", value: "1" }, { label: "1½", value: "1.5" }, { label: "2", value: "2" }].map(item => ({ value: item.value, label: `${item.label} × ${selected.label} (${multiplyDecimal(selected.grams, item.value)} g)` }))]} onValueChange={value => { setDirty(true); setCount(value); }} disabled={locked} /><NumberField label="Portion count" value={count} onChangeText={value => { setDirty(true); setCount(value); }} editable={!locked} /></> : <><Copy>No household conversion is assumed. Use grams or choose a measured portion recorded for this food.</Copy><NumberField label="Grams" value={quantity} onChangeText={value => { setDirty(true); setQuantity(value); }} editable={!locked} /></>}
    <Field label="Consumed at (with UTC offset)" value={instant} onChangeText={value => { setDirty(true); setInstant(value); }} editable={!locked} autoCapitalize="none" hint="Change this for a historical meal. Use YYYY-MM-DDTHH:mm:ss+05:30 or Z for UTC; grouping follows your profile time zone." />
    <Field label="Meal notes" value={notes} onChangeText={value => { setDirty(true); setNotes(value); }} editable={!locked} multiline maxLength={2000} />
  </Card>{guard.dialog}<FormError error={failure} /><QuantityPreview foodId={food.id} grams={preview} /><MutationNote mutation={mutation} retryable onSuccess={saved} /><Action label="Log food" loading={mutation.pending} disabled={locked || !preview} onPress={() => { void save(); }} /></>;
}
export default function FoodDetailScreen() {
  const { foodId } = useNutritionParams();
  const api = useApi();
  const load = useCallback((signal: AbortSignal) => api.request("get", "/api/v1/foods/{food_id}", { params: { food_id: foodId ?? "" }, signal, validate: foodCheck }), [api, foodId]);
  const resource = useResource(load);
  return <Page onRefresh={resource.reload} refreshing={resource.loading}><Back /><Title>Food details</Title>{resource.loading ? <LoadingSkeleton /> : null}{resource.error ? <ErrorState message={errorMessage(resource.error)} onRetry={resource.reload} /> : null}{resource.data && resource.data.id === foodId ? <><PhotoContainer label={resource.data.name} /><Title>{resource.data.name}</Title><Card><Copy>{resource.data.brand ?? "No brand supplied"}</Copy><Copy>Source: {resource.data.source} · {resource.data.food_kind.replaceAll("_", " ")}</Copy><AppText>{resource.data.verified_at ? "Verified catalog record" : "Verification date unavailable"}</AppText>{resource.data.license_name ? <Copy>Data license: {resource.data.license_name}</Copy> : null}{resource.data.source_url ? <AppText selectable>{resource.data.source_url}</AppText> : null}<Copy>{resource.data.aliases?.join(" · ")}</Copy></Card><Nutrients title="Per 100 g" value={resource.data} /><FoodLog key={resource.data.id} food={resource.data} /></> : null}</Page>;
}
