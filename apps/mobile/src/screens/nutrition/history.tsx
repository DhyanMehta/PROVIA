import { useCallback, useState } from "react";
import { FlatList, View } from "react-native";
import { router } from "expo-router";
import { Action, Card, Copy, EmptyState, ErrorState, Field, LoadingSkeleton, Page, Title } from "../../components/ui";
import { useApi } from "../../providers/api";
import { useResource } from "../../hooks/use-resource";
import { errorMessage } from "../../lib/api-client";
import { shiftDate } from "../../lib/form-values";
import { metric } from "../../lib/format";
import { spacing } from "../../theme";
import { Back, FormError } from "./common";
import { mealPageCheck } from "./contracts";
export default function MealHistoryScreen() {
  const api = useApi();
  const [start, setStart] = useState(""), [end, setEnd] = useState(""), [range, setRange] = useState<{ start_date: string; end_date: string }>();
  const [offset, setOffset] = useState(0), [failure, setFailure] = useState<unknown>();
  const load = useCallback(async (signal: AbortSignal) => ({ offset, range, page: await api.request("get", "/api/v1/meals", { signal, query: { limit: 20, offset, ...range }, validate: mealPageCheck }) }), [api, offset, range]);
  const resource = useResource(load), data = resource.data?.offset === offset && resource.data.range === range ? resource.data.page : undefined;
  function apply() { try { if (!start && !end) setRange(undefined); else { const a = shiftDate(start, 0), b = shiftDate(end, 0); const days = (Date.parse(b) - Date.parse(a)) / 86400000; if (days < 0 || days > 365) throw new Error("Choose an ordered range of at most 366 days."); setRange({ start_date: a, end_date: b }); } setOffset(0); setFailure(undefined); } catch (error) { setFailure(error); } }
  return <Page scroll={false}><Back /><Title>Meal history</Title><Field label="Start date (optional YYYY-MM-DD)" value={start} onChangeText={setStart} /><Field label="End date (optional YYYY-MM-DD)" value={end} onChangeText={setEnd} /><Action label="Apply date range" secondary onPress={apply} /><FormError error={failure} />{resource.loading ? <LoadingSkeleton lines={2} /> : null}{resource.error ? <ErrorState message={errorMessage(resource.error)} onRetry={resource.reload} /> : null}<FlatList data={data?.items ?? []} keyExtractor={item => item.id} contentContainerStyle={{ gap: spacing.md }} renderItem={({ item }) => <Card><Copy>{item.meal_type} · {item.consumed_at}</Copy><Copy>{metric(item.totals.calories_kcal, "kcal")} · {item.items.length} foods</Copy><Action label="Open meal" secondary onPress={() => router.push({ pathname: "/nutrition/meal/[meal_id]", params: { meal_id: item.id } })} /></Card>} ListEmptyComponent={data ? <EmptyState title="No meals in this range" message="Log a meal or change the selected dates." /> : undefined} ListFooterComponent={data ? <View style={{ gap: spacing.md }}><Copy>Page {Math.floor(offset / 20) + 1}</Copy><Action label="Previous meals" secondary disabled={offset === 0} onPress={() => setOffset(value => Math.max(0, value - 20))} /><Action label="Next meals" secondary disabled={data.items.length < 20} onPress={() => setOffset(value => value + 20)} /></View> : undefined} /></Page>;
}
