import { useCallback, useState } from "react";
import { router } from "expo-router";
import { Action, AppText, Card, Copy, EmptyState, ErrorState, Field, LoadingSkeleton, MacroProgress, Page, SectionHeader, Title } from "../../components/ui";
import { useResource } from "../../hooks/use-resource";
import { useApi } from "../../providers/api";
import { dateOnly, shiftDate } from "../../lib/form-values";
import { metric } from "../../lib/format";
import { errorMessage } from "../../lib/api-client";
import { mealKinds } from "./common";
import { nutritionCheck } from "./contracts";
const numberForDisplay = (value: string | null) => value === null ? null : Number(value);

export default function NutritionScreen() {
  const api = useApi();
  const [selected, setSelected] = useState<string>();
  const [draft, setDraft] = useState("");
  const [inputError, setInputError] = useState<string>();
  const load = useCallback(async (signal: AbortSignal) => {
    const profile = selected ? undefined : await api.request("get", "/api/v1/profile", { signal, validate: value => !!value && typeof value.timezone === "string" });
    return api.request("get", "/api/v1/nutrition/dashboard", { signal, query: { date: selected ?? dateOnly(profile!.timezone) }, validate: nutritionCheck });
  }, [api, selected]);
  const result = useResource(load);
  const data = result.data;
  const change = (day: string) => { setSelected(day); setDraft(day); };
  const current = selected ?? data?.date;
  return <Page onRefresh={result.reload} refreshing={result.loading}><Title eyebrow="NOURISH YOUR DAY">Nutrition</Title>
    <Card><SectionHeader title={current ?? "Your day"} description={data ? `Profile time zone: ${data.timezone}` : "Loading your profile day"} />
      <Field label="Date (YYYY-MM-DD)" value={draft} onChangeText={setDraft} error={inputError} placeholder={current} autoCapitalize="none" />
      <Action label="View date" secondary onPress={() => { try { change(shiftDate(draft, 0)); setInputError(undefined); } catch (error) { setInputError((error as Error).message); } }} />
      {current ? <><Action label="Previous day" secondary onPress={() => change(shiftDate(current, -1))} /><Action label="Next day" secondary onPress={() => change(shiftDate(current, 1))} /></> : null}
      <Action label="Today" secondary onPress={() => { setSelected(undefined); setDraft(""); }} />
    </Card>
    {result.loading ? <LoadingSkeleton /> : null}{result.error ? <ErrorState message={errorMessage(result.error)} onRetry={result.reload} /> : null}
    {data && (!selected || data.date === selected) ? <><Card><AppText variant="heading">Daily energy</AppText><MacroProgress label="Energy" consumed={numberForDisplay(data.calories.consumed)} target={numberForDisplay(data.calories.target)} remaining={numberForDisplay(data.calories.remaining)} unit="kcal" /><Copy>Targets and remaining nutrition are calculated by PROVIA. Unknown nutrients remain unrecorded.</Copy></Card>
      <Card><SectionHeader title="Your nutrients" />{(["protein", "carbs", "fat", "fiber"] as const).map(key => <MacroProgress key={key} label={key[0].toUpperCase() + key.slice(1)} consumed={numberForDisplay(data[key].consumed_g)} target={numberForDisplay(data[key].target_g)} remaining={numberForDisplay(data[key].remaining_g)} />)}</Card>
      {mealKinds.map(kind => { const meals = data.meals.filter(meal => meal.meal_type === kind); return <Card key={kind}><SectionHeader title={kind[0].toUpperCase() + kind.slice(1)} />{meals.length ? meals.map(meal => <Action key={meal.id} label={`${new Date(meal.consumed_at).toLocaleTimeString(undefined, { timeZone: data.timezone, hour: "2-digit", minute: "2-digit" })} · ${metric(meal.totals.calories_kcal, "kcal")} · ${meal.items.length} foods`} secondary onPress={() => router.push({ pathname: "/nutrition/meal/[meal_id]", params: { meal_id: meal.id } })} />) : <Copy>No {kind} logged.</Copy>}<Action label={`Add ${kind}`} onPress={() => router.push({ pathname: "/nutrition/search", params: { kind } })} /></Card>; })}
      {!data.meals.length ? <EmptyState title="A fresh page" message="Search a food or scan a barcode to log your first meal." /> : null}
      {current !== dateOnly(data.timezone) ? <Copy>Historical records use the selected profile-zone day. New meals open with an explicit timestamp that you can change before saving.</Copy> : null}
    </> : null}
    <Action label="Meal history" secondary onPress={() => router.push("/nutrition/history")} /><Action label="My recipes" secondary onPress={() => router.push("/nutrition/recipes")} /><Action label="Create custom food" secondary onPress={() => router.push("/nutrition/custom-food")} /><Action label="Scan barcode" secondary onPress={() => router.push("/nutrition/barcode")} />
  </Page>;
}
