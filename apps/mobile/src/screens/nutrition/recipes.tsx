import { useCallback, useState } from "react";
import { FlatList, View } from "react-native";
import { router } from "expo-router";
import { Action, Card, Copy, EmptyState, ErrorState, Field, LoadingSkeleton, NumberField, Page, Title } from "../../components/ui";
import { useApi } from "../../providers/api";
import { useResource } from "../../hooks/use-resource";
import { useMutation } from "../../hooks/use-mutation";
import type { Schema } from "../../lib/contracts";
import { errorMessage } from "../../lib/api-client";
import { spacing } from "../../theme";
import { Back, FormError, MutationNote, Nutrients, useDraftGuard, useNutritionParams } from "./common";
import { recipeCheck, recipePageCheck } from "./contracts";
import { recipeInput, type IngredientDraft, type PortionDraft } from "./forms";
import { FoodPicker } from "./search";
import { FoodLog, QuantityPreview } from "./food";
import { PortionEditor } from "./portion-editor";
export function RecipeListScreen() {
  const api = useApi(), [offset, setOffset] = useState(0);
  const load = useCallback(async (signal: AbortSignal) => ({ offset, page: await api.request("get", "/api/v1/recipes", { signal, query: { limit: 20, offset }, validate: recipePageCheck }) }), [api, offset]);
  const resource = useResource(load), data = resource.data?.offset === offset ? resource.data.page : undefined;
  return <Page scroll={false}><Back /><Title>My recipes</Title><Copy>Each saved recipe preserves measured ingredient snapshots and cooked yield. To change a recipe, save a new version.</Copy><Action label="Create recipe" onPress={() => router.push("/nutrition/recipes/new")} />{resource.loading ? <LoadingSkeleton /> : null}{resource.error ? <ErrorState message={errorMessage(resource.error)} onRetry={resource.reload} /> : null}<FlatList data={data?.items ?? []} keyExtractor={item => item.id} contentContainerStyle={{ gap: spacing.md }} renderItem={({ item }) => <Card><Copy>{item.food.name} · cooked yield {item.yield_g} g</Copy>{item.incomplete ? <Copy>Some ingredient nutrients are unknown.</Copy> : null}<Action label={`Open ${item.food.name}`} secondary onPress={() => router.push({ pathname: "/nutrition/recipes/[recipe_id]", params: { recipe_id: item.id } })} /></Card>} ListEmptyComponent={data ? <EmptyState title="Your kitchen, measured" message="Create a recipe from actual ingredients and the final cooked weight." /> : undefined} ListFooterComponent={data ? <View style={{ gap: spacing.md }}><Action label="Previous recipes" secondary disabled={!offset} onPress={() => setOffset(value => Math.max(0, value - 20))} /><Action label="Next recipes" secondary disabled={data.items.length < 20} onPress={() => setOffset(value => value + 20)} /></View> : undefined} /></Page>;
}
export function RecipeCreateScreen() {
  const api = useApi(), mutation = useMutation();
  const [name, setName] = useState(""), [yieldGrams, setYieldGrams] = useState(""), [aliases, setAliases] = useState("");
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([]), [portions, setPortions] = useState<PortionDraft[]>([]), [picking, setPicking] = useState(false), [failure, setFailure] = useState<unknown>();
  const locked = mutation.pending || mutation.uncertain;
  const guard = useDraftGuard(!!(name || aliases || yieldGrams || ingredients.length || portions.length), mutation.uncertain, mutation.pending);
  const saved = (value: unknown) => { guard.allow(); router.replace({ pathname: "/nutrition/recipes/[recipe_id]", params: { recipe_id: (value as Schema<"RecipeOut">).id } }); };
  async function save() { try { const body = recipeInput(name, yieldGrams, ingredients, aliases, portions); setFailure(undefined); const result = await mutation.run(key => api.request("post", "/api/v1/recipes", { body, idempotencyKey: key, validate: recipeCheck }), { idempotent: true }); if (result) saved(result); } catch (error) { setFailure(error); } }
  if (picking) return <Page scroll={false}>{guard.dialog}<Title>Select ingredient</Title><Action label="Return to recipe" secondary onPress={() => setPicking(false)} /><FoodPicker onSelect={food => { if (ingredients.some(row => row.food_id === food.id)) setFailure(new Error("This ingredient is already included. Update its combined quantity.")); else setIngredients(previous => [...previous, { food_id: food.id, name: food.name, quantity_g: "" }]); setPicking(false); }} /></Page>;
  return <Page><Back /><Title>Create recipe</Title><Copy>Include all measured ingredients, including oil or ghee. Weigh the final cooked yield. Nutrition is calculated by the server when you save; unknown ingredient nutrients remain unknown.</Copy><Field label="Recipe name" value={name} onChangeText={setName} editable={!locked} maxLength={300} /><NumberField label="Final cooked yield (g)" value={yieldGrams} onChangeText={setYieldGrams} editable={!locked} /><Field label="Aliases (comma separated)" hint="Add names for this same preparation in English, Hinglish, Hindi or Gujarati, such as its regional name. Do not alias dishes with different ingredients or cooking methods." value={aliases} onChangeText={setAliases} editable={!locked} />
    {ingredients.map((row, index) => <Card key={row.food_id}><Copy>{row.name}</Copy><NumberField label={`Ingredient ${index + 1} grams`} value={row.quantity_g} editable={!locked} onChangeText={quantity_g => setIngredients(previous => previous.map((item, at) => at === index ? { ...item, quantity_g } : item))} /><Action label={`Remove ingredient ${index + 1}`} secondary disabled={locked} onPress={() => setIngredients(previous => previous.filter((_, at) => at !== index))} />{/^\d+(\.\d{1,3})?$/.test(row.quantity_g) && Number(row.quantity_g) > 0 && Number(row.quantity_g) <= 100000 ? <QuantityPreview foodId={row.food_id} grams={row.quantity_g} /> : null}</Card>)}
    <Action label="Add ingredient" secondary disabled={locked || ingredients.length >= 100} onPress={() => setPicking(true)} /><PortionEditor value={portions} onChange={setPortions} disabled={locked} />{guard.dialog}<FormError error={failure} /><MutationNote mutation={mutation} retryable onSuccess={saved} /><Action label="Save measured recipe" loading={mutation.pending} disabled={locked || !ingredients.length} onPress={() => { void save(); }} /></Page>;
}
export function RecipeDetailScreen() {
  const { recipeId } = useNutritionParams();
  const api = useApi();
  const load = useCallback((signal: AbortSignal) => api.request("get", "/api/v1/recipes/{recipe_id}", { params: { recipe_id: recipeId ?? "" }, signal, validate: recipeCheck }), [api, recipeId]);
  const resource = useResource(load), data = resource.data?.id === recipeId ? resource.data : undefined;
  return <Page onRefresh={resource.reload} refreshing={resource.loading}><Back /><Title>{data?.food.name ?? "Recipe details"}</Title>{resource.error ? <ErrorState message={errorMessage(resource.error)} onRetry={resource.reload} /> : null}{resource.loading ? <LoadingSkeleton /> : null}{data ? <><Copy>Cooked yield: {data.yield_g} g · {data.ingredients.length} measured ingredients. This recipe is immutable; save a new recipe to change it.</Copy>{data.incomplete ? <Copy>Nutrition is incomplete because at least one ingredient has unknown nutrients.</Copy> : null}<Nutrients title="Recipe per 100 g" value={data.food} />{data.ingredients.map((item, index) => <Card key={item.food_id}><Copy>Ingredient {index + 1}: {item.quantity_g} g</Copy><Action label={`View ingredient ${index + 1}`} secondary onPress={() => router.push({ pathname: "/nutrition/food/[food_id]", params: { food_id: item.food_id } })} /></Card>)}<FoodLog food={data.food} /></> : null}</Page>;
}
