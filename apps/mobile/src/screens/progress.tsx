import { useCallback, useState } from "react";
import { router } from "expo-router";
import { Action, Card, Copy, ErrorNote, Field, LoadingSkeleton, MetricRow, Page, Title } from "../components/ui";
import { ObservedChart } from "../components/observed-chart";
import { useApi } from "../providers/api";
import { useResource } from "../hooks/use-resource";
import { dateOnly, kgToLb, shiftDate } from "../lib/form-values";
import { errorMessage } from "../lib/api-client";
import { metric } from "../lib/format";
import { progressCheck } from "../lib/progress-values";
export { progressCheck } from "../lib/progress-values";

const number = (value: string | number | null | undefined) => value == null ? null : Number(value);
export default function ProgressScreen() {
  const api = useApi();
  const [range, setRange] = useState<{ start_date: string; end_date: string }>();
  const [from, setFrom] = useState(""), [to, setTo] = useState(""), [inputError, setInputError] = useState("");
  const resource = useResource(useCallback(async signal => {
    const profile = await api.request("get", "/api/v1/profile", { signal, validate: value => !!value && typeof value.timezone === "string" && ["kg", "lb"].includes(value.preferred_weight_unit) });
    const end_date = dateOnly(profile.timezone);
    const selected = range ?? { start_date: shiftDate(end_date, -6), end_date };
    const data = await api.request("get", "/api/v1/progress/overview", { signal, query: selected, validate: progressCheck });
    return { data, profile };
  }, [api, range]));
  const data = resource.data?.data, profile = resource.data?.profile;
  const preset = (days: number) => { if (profile) { const end_date = dateOnly(profile.timezone); setRange({ start_date: shiftDate(end_date, 1 - days), end_date }); } };
  const apply = () => { try { shiftDate(from, 0); shiftDate(to, 0); const days = (Date.parse(to) - Date.parse(from)) / 86400000; if (days < 0 || days > 365) throw new Error("Choose an ordered range of at most 366 days."); setRange({ start_date: from, end_date: to }); setInputError(""); } catch (error) { setInputError((error as Error).message); } };
  return <Page refreshing={resource.loading} onRefresh={resource.reload}><Title eyebrow="YOUR RECORDED PROGRESS">See the pattern</Title><Copy>Actual logs, historical targets and observed measurements. Missing data stays unknown.</Copy>
    {!data && resource.loading ? <LoadingSkeleton lines={6} /> : null}{resource.error ? <><ErrorNote message={errorMessage(resource.error)} /><Action secondary label="Refresh progress" onPress={resource.reload} />{data ? <Copy>Showing previously fetched values.</Copy> : null}</> : null}
    {data && profile ? <><Card><MetricRow label="Date range" value={`${data.start_date} to ${data.end_date}`} detail={data.timezone} /><Action secondary label="Last 7 days" onPress={() => preset(7)} /><Action secondary label="Last 30 days" onPress={() => preset(30)} /><Field label="Custom start (YYYY-MM-DD)" value={from} onChangeText={setFrom} placeholder={data.start_date} maxLength={10} /><Field label="Custom end (YYYY-MM-DD)" value={to} onChangeText={setTo} placeholder={data.end_date} maxLength={10} />{inputError ? <ErrorNote message={inputError} /> : null}<Action label="Apply custom range" onPress={apply} /></Card>
      <ObservedChart title="Measured weight" unit={profile.preferred_weight_unit} dots points={data.weight_history.map(row => ({ label: new Date(row.recorded_at).toLocaleString("en-CA", { timeZone: data.timezone }), value: Number(profile.preferred_weight_unit === "lb" ? kgToLb(row.weight_kg) : row.weight_kg) }))} />
      <MetricRow label="Observed weight change" value={metric(data.weight_change_kg === null ? null : profile.preferred_weight_unit === "kg" ? data.weight_change_kg : `${data.weight_change_kg.startsWith("-") ? "-" : ""}${kgToLb(data.weight_change_kg.replace(/^-/, ""))}`, profile.preferred_weight_unit)} detail="Requires at least two actual measurements." />
      <ObservedChart title="Calories and historical target" unit="kcal" points={data.daily.map(day => ({ label: day.date, value: day.nutrition.has_logs ? number(day.nutrition.calories_consumed) : null, target: number(day.nutrition.calories_target) }))} />
      <ObservedChart title="Calorie adherence" unit="% of historical target" points={data.daily.map(day => ({ label: day.date, value: day.nutrition.adherence_ratio === null ? null : Number(day.nutrition.adherence_ratio) * 100 }))} />
      {(["protein", "carbs", "fat", "fiber"] as const).map(key => <Card key={key}><ObservedChart title={`${key[0].toUpperCase()}${key.slice(1)} consumed and target`} unit="g" points={data.daily.map(day => ({ label: day.date, value: day.nutrition.has_logs ? number(day.nutrition[key].consumed_g) : null, target: number(day.nutrition[key].target_g) }))} /><ObservedChart title={`${key} adherence`} unit="% of historical target" points={data.daily.map(day => ({ label: day.date, value: day.nutrition[key].adherence_ratio === null ? null : Number(day.nutrition[key].adherence_ratio) * 100 }))} /></Card>)}
      <ObservedChart title="Completed workout frequency" unit="sessions" points={data.workouts.daily.map(day => ({ label: day.date, value: day.count }))} /><ObservedChart title="Recorded workout duration per session" unit="minutes" points={data.workouts.history.map((row, index) => ({ label: `${row.date} · session ${index + 1}`, value: row.duration_seconds === null ? null : row.duration_seconds / 60 }))} />
      <Action secondary label="View actual workout personal records" onPress={() => router.push("/workouts/progress")} />
      <ObservedChart title="Water intake" unit="ml" points={data.daily.map(day => ({ label: day.date, value: day.water.has_logs ? number(day.water.consumed_ml) : null, target: number(day.water.target_ml) }))} /><MetricRow label="Water target days met" value={`${data.water_consistency.days_met} / ${data.water_consistency.observed_days_with_target}`} detail="Only observed days with a known target are counted." />
      <ObservedChart title="Recorded steps" unit="steps" points={data.daily.map(day => ({ label: day.date, value: day.activity?.steps ?? null }))} /><ObservedChart title="Sleep on wake date" unit="hours" points={data.daily.map(day => ({ label: day.date, value: day.sleep.duration_seconds === null ? null : day.sleep.duration_seconds / 3600 }))} />
    </> : null}
  </Page>;
}
