import { useCallback, useState } from "react";
import { router } from "expo-router";
import { Action, AppText, Card, ChartContainer, Copy, EmptyState, Page, SectionHeader, SelectField, Title, Value } from "../../components/ui";
import { FlatList, Pressable, View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import { useResource } from "../../hooks/use-resource";
import { useApi } from "../../providers/api";
import { useTheme } from "../../theme";
import { dateOnly, shiftDate } from "../../lib/form-values";
import { duration, elapsedSeconds, exercise, sessions, summary, titleOf, type Summary } from "./data";
import { LoadState, Pager, RangeFields, useRouteId } from "./common";
import { useExerciseNames } from "./use-exercise-names";

export function WorkoutHistoryScreen() {
  const api = useApi();
  const [filter, setFilter] = useState<"" | "in_progress" | "completed" | "cancelled">("");
  const [range, setRange] = useState<{ start_date: string; end_date: string }>();
  const [offset, setOffset] = useState(0);
  const result = useResource(useCallback(async signal => {
    const [page, profile] = await Promise.all([sessions(api, { ...range, status: filter || undefined, offset }, signal), api.request("get", "/api/v1/profile", { signal, validate: value => !!value && typeof value.timezone === "string" })]);
    return { page, timezone: profile.timezone };
  }, [api, range, filter, offset]));
  const timezone = result.data?.timezone;
  return <Page refreshing={result.loading} onRefresh={result.reload}><Title eyebrow="Your training">Workout history</Title><Copy>Completed, cancelled and active sessions remain distinct. Old active sessions can be opened and explicitly completed or cancelled.</Copy>
    <SelectField label="Session status" value={filter} onValueChange={value => { setFilter(value); setOffset(0); }} options={[{ label: "All statuses", value: "" }, { label: "Completed", value: "completed" }, { label: "Cancelled", value: "cancelled" }, { label: "In progress", value: "in_progress" }]} />
    {timezone ? <RangeFields initial={range ?? { start_date: shiftDate(dateOnly(timezone), -29), end_date: dateOnly(timezone) }} onApply={value => { setRange(value); setOffset(0); }} /> : null}
    {range ? <Action label="Clear date filter" secondary onPress={() => { setRange(undefined); setOffset(0); }} /> : null}
    <LoadState resource={result}>{result.data?.page.items.map(row => <Card key={row.id}><AppText variant="heading">{titleOf(row)}</AppText><Copy>{row.status.replace("_", " ")} · {new Date(row.started_at).toLocaleString(undefined, { timeZone: timezone })}</Copy><Copy>{row.sets.length} stored sets · {row.status === "in_progress" ? "Ongoing" : duration(elapsedSeconds(row))}</Copy><Action label={row.status === "in_progress" ? "Resume this session" : "View saved session"} secondary onPress={() => router.push({ pathname: "/workouts/sessions/[sessionId]", params: { sessionId: row.id } })} /></Card>)}{result.data?.page.items.length === 0 ? <EmptyState title="No sessions in this view" message="Change the status or date filters, or start your next workout." /> : null}{result.data ? <Pager count={result.data.page.items.length} offset={offset} onChange={setOffset} /> : null}</LoadState>
  </Page>;
}

export function WorkoutProgressScreen({ forExercise = false }: { forExercise?: boolean }) {
  const api = useApi();
  const exerciseId = useRouteId("exerciseId");
  const [range, setRange] = useState<{ start_date: string; end_date: string }>();
  const [historyPage, setHistoryPage] = useState(0);
  const [recordPage, setRecordPage] = useState(0);
  const result = useResource(useCallback(async signal => {
    const [data, selected] = await Promise.all([summary(api, range ?? {}, signal, forExercise ? exerciseId : undefined), forExercise ? exercise(api, exerciseId, signal) : Promise.resolve(null)]);
    return { data, selected };
  }, [api, range, forExercise, exerciseId]));
  const data = result.data?.data;
  const records = Object.entries(data?.personal_records ?? {});
  const recordOffset = Math.min(recordPage, Math.max(0, Math.ceil(records.length / 20) - 1)) * 20;
  const historyOffset = Math.min(historyPage, Math.max(0, Math.ceil((data?.history.length ?? 0) / 20) - 1)) * 20;
  const visibleRecords = records.slice(recordOffset, recordOffset + 20);
  const names = useExerciseNames(visibleRecords.map(([id]) => id));
  const changeRange = (selected: { start_date: string; end_date: string }) => { setRange(selected); setHistoryPage(0); setRecordPage(0); };
  const quickRange = (days: number) => { if (data) { const end_date = dateOnly(data.timezone); changeRange({ start_date: shiftDate(end_date, 1 - days), end_date }); } };
  return <Page refreshing={result.loading} onRefresh={result.reload}><Title eyebrow="Observed progress">{result.data?.selected?.name ?? "Your training, over time"}</Title><Copy>Completed sessions and their recorded working sets. No estimated calories or one-repetition maximums.</Copy>
    {data ? <><View style={{ gap: 8 }}><Action label="Last 7 days" secondary onPress={() => quickRange(7)} /><Action label="Last 30 days" secondary onPress={() => quickRange(30)} /></View><RangeFields key={`${data.start_date}:${data.end_date}`} initial={{ start_date: data.start_date, end_date: data.end_date }} onApply={changeRange} /></> : null}
    <LoadState resource={result}>{data ? <>
      <Card><SectionHeader title="Training totals" description={`${data.start_date} to ${data.end_date} · ${data.timezone}`} /><Value label="Completed workouts" value={String(data.total_workouts)} /><Value label="Recorded duration" value={duration(data.total_duration_seconds)} /><Value label="Working-set volume" value={`${data.total_volume_kg} kg`} /><Copy>{data.active_days} active days · server consistency {data.consistency_ratio}</Copy><Copy>This week: {data.workouts_this_week} · This month: {data.workouts_this_month}</Copy></Card>
      {data.total_workouts === 0 ? <EmptyState title="Your progress starts with a recorded session" message="Complete a workout to see observed training history and personal records here." /> : null}
      <TrainingChart data={data} />
      <SectionHeader title="Personal records" description="Actual recorded working sets. Warmup, skipped and incomplete sets are excluded by the server." />
      {visibleRecords.map(([id, record]) => <Card key={id}><AppText variant="heading">{names.data?.[id] ?? result.data?.selected?.name ?? "Exercise name unavailable"}</AppText><Value label="Heaviest recorded weight" value={record.heaviest_weight_kg === null ? "Not recorded" : `${record.heaviest_weight_kg} kg`} /><Value label="Highest recorded repetitions" value={record.highest_reps === null ? "Not recorded" : String(record.highest_reps)} /><Value label="Highest session working volume" value={`${record.highest_session_volume_kg} kg`} /><Action label="View exercise history" secondary onPress={() => router.push({ pathname: "/workouts/exercises/[exerciseId]/history", params: { exerciseId: id } })} /></Card>)}
      {Object.keys(data.personal_records).length === 0 ? <Copy>No qualifying working sets are recorded in this view.</Copy> : null}
      <ProgressPager label="personal records" offset={recordOffset} total={records.length} onChange={offset => setRecordPage(offset / 20)} />
      <SectionHeader title="Sessions in this range" />{data.history.slice(historyOffset, historyOffset + 20).map(row => <Card key={row.id}><AppText variant="label">{row.date} · {new Date(row.started_at).toLocaleTimeString(undefined, { timeZone: data.timezone })}</AppText><Copy>Duration {duration(row.duration_seconds)} · volume {row.volume_kg} kg</Copy>{row.sets?.slice(0, 10).map(set => <Copy key={set.id}>Set {set.set_number}: {set.reps} reps × {set.weight_kg} kg · {set.kind}</Copy>)}{row.sets && row.sets.length > 10 ? <Copy>Showing the first 10 of {row.sets.length} sets. Open the saved session for all recorded sets.</Copy> : null}<Action label="Open recorded session" secondary onPress={() => router.push({ pathname: "/workouts/sessions/[sessionId]", params: { sessionId: row.id } })} /></Card>)}
      <ProgressPager label="recorded sessions" offset={historyOffset} total={data.history.length} onChange={offset => setHistoryPage(offset / 20)} />
    </> : null}</LoadState>
  </Page>;
}

function ProgressPager({ label, offset, total, onChange }: { label: string; offset: number; total: number; onChange: (offset: number) => void }) {
  return <View style={{ gap: 8 }}><Copy>{label}: {total ? offset + 1 : 0}–{Math.min(offset + 20, total)} of {total}</Copy><Action label={`Previous ${label} page`} secondary disabled={offset === 0} onPress={() => onChange(Math.max(0, offset - 20))} /><Action label={`Next ${label} page`} secondary disabled={offset + 20 >= total} onPress={() => onChange(offset + 20)} /></View>;
}

function TrainingChart({ data }: { data: Summary }) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const row = data.daily.find(day => day.date === selected);
  const highest = Math.max(1, ...data.daily.map(day => day.count));
  const width = 320, height = 140;
  const x = (index: number) => 12 + index * (width - 24) / Math.max(1, data.daily.length - 1);
  return <ChartContainer title="Workout frequency" description="Tap an observed day, or use the accessible values below. Each point is the server's completed workout count.">
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} accessibilityLabel="Completed workout frequency chart">
      <Line x1={12} y1={height - 12} x2={width - 12} y2={height - 12} stroke={colors.line} />
      {data.daily.map((day, index) => <Circle key={day.date} cx={x(index)} cy={height - 12 - day.count * (height - 24) / highest} r={selected === day.date ? 6 : 4} fill={colors.accent} onPress={() => setSelected(day.date)} />)}
    </Svg>
    {row ? <AppText variant="label">{row.date}: {row.count} workouts · {row.volume_kg} kg volume</AppText> : <Copy>Select a day to inspect its recorded count and volume.</Copy>}
    <FlatList horizontal data={data.daily} keyExtractor={day => day.date} contentContainerStyle={{ gap: 8 }} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.date}, ${item.count} completed workouts, ${item.volume_kg} kilograms volume`} onPress={() => setSelected(item.date)} style={{ minHeight: 48, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: selected === item.date ? colors.accent : colors.line }}><AppText variant="caption">{item.date}</AppText><AppText variant="label">{item.count} workouts</AppText><Copy>{item.volume_kg} kg</Copy></Pressable>} />
  </ChartContainer>;
}
