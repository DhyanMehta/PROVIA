import { useCallback, useEffect, useState } from "react";
import { FlatList, View } from "react-native";
import { router } from "expo-router";
import { Action, AppText, Card, Copy, EmptyState, ErrorState, Field, LoadingSkeleton, Page, SelectField, Title } from "../../components/ui";
import { useApi } from "../../providers/api";
import { useResource } from "../../hooks/use-resource";
import type { Schema } from "../../lib/contracts";
import { errorMessage } from "../../lib/api-client";
import { metric } from "../../lib/format";
import { spacing } from "../../theme";
import { Back, useNutritionParams } from "./common";
import { searchCheck } from "./contracts";
const sources = ["all", "local", "indian_curated", "usda", "open_food_facts"] as const;
export function FoodPicker({ onSelect }: { onSelect: (food: Schema<"FoodOut">) => void }) {
  const api = useApi();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<typeof sources[number]>("all");
  const [page, setPage] = useState(1);
  useEffect(() => { const timer = setTimeout(() => { setQuery(draft.trim()); setPage(1); }, 350); return () => clearTimeout(timer); }, [draft]);
  const load = useCallback(async (signal: AbortSignal) => ({ query, source, page, result: query.length ? await api.request("get", "/api/v1/foods/search", { signal, query: { q: query, source, page, page_size: 20 }, validate: searchCheck }) : undefined }), [api, query, source, page]);
  const resource = useResource(load);
  const current = resource.data?.query === query && resource.data?.source === source && resource.data?.page === page;
  const data = current ? resource.data?.result : undefined;
  return <View style={{ flex: 1, gap: spacing.lg }}><Field label="Search foods" value={draft} onChangeText={setDraft} maxLength={100} placeholder="Food, brand or ingredient" autoCapitalize="none" />
    <SelectField label="Food source" value={source} options={sources.map(value => ({ value, label: value.replaceAll("_", " ") }))} onValueChange={value => { setSource(value); setPage(1); }} />
    {draft.trim() !== query || resource.loading ? <LoadingSkeleton lines={2} /> : null}{resource.error ? <ErrorState message={errorMessage(resource.error)} onRetry={resource.reload} /> : null}
    {!query ? <EmptyState title="Find your food" message="Search verified catalog entries or foods you created. Indian catalog coverage depends on approved data." /> : null}
    {data ? <><Copy>Page {page}. Results are paged per source. Nutrients shown per 100 g.</Copy><FlatList data={data.items} keyExtractor={item => item.id} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" style={{ minHeight: 120 }} contentContainerStyle={{ gap: spacing.md }} renderItem={({ item }) => <Card><AppText variant="heading">{item.name}</AppText><Copy>{item.brand ?? item.source} · {metric(item.calories_kcal, "kcal")}</Copy><Action label={`Select ${item.name}`} secondary onPress={() => onSelect(item)} /></Card>} ListEmptyComponent={<EmptyState title="No matching foods" message="Try another term or create a custom food with known nutrition." />} />
      {Object.entries(data.provider_status).map(([provider, status]) => <Copy key={provider}>{provider.replaceAll("_", " ")}: {status.replaceAll("_", " ")}</Copy>)}
      <Action label="Previous results" secondary disabled={page === 1} onPress={() => setPage(value => value - 1)} /><Action label="Next results" secondary disabled={page >= 1000 || data.items.length === 0} onPress={() => setPage(value => value + 1)} /></> : null}
  </View>;
}
export default function FoodSearchScreen() {
  const { kind } = useNutritionParams();
  return <Page scroll={false}><Back /><Title>Food search</Title><FoodPicker onSelect={food => router.push({ pathname: "/nutrition/food/[food_id]", params: { food_id: food.id, kind } })} /></Page>;
}
