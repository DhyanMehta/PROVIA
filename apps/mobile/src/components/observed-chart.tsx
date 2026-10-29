import { useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { AppText, ChartContainer, Copy, MetricRow } from "./ui";
import { useTheme } from "../theme";
export type Observation = { label: string; value: number | null; target?: number | null };
/** Actual observations only: null stays unknown; gaps are never interpolated. */
export function ObservedChart({ title, unit, points, dots = false }: { title: string; unit: string; points: Observation[]; dots?: boolean }) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<number>();
  const [table, setTable] = useState(false);
  const [tablePage, setTablePage] = useState(0);
  const pageSize = 20;
  const page = Math.min(tablePage, Math.max(0, Math.ceil(points.length / pageSize) - 1));
  const tablePoints = points.slice(page * pageSize, (page + 1) * pageSize);
  const values = points.flatMap(point => [point.value, point.target].filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value)));
  const max = Math.max(1, ...values);
  const current = points[Math.min(selected ?? points.length - 1, points.length - 1)];
  return <ChartContainer title={title} description={dots ? "Recorded measurements only. Tap a point to inspect it; no values are inferred between measurements." : "Tap a day to inspect it. Dashes mean unrecorded; an outlined marker shows an available target."}>
    {current ? <MetricRow label={current.label} value={current.value === null ? "Not recorded" : `${current.value.toLocaleString()} ${unit}`} detail={current.target === null || current.target === undefined ? undefined : `Target ${current.target.toLocaleString()} ${unit}`} /> : <Copy>No observations in this range.</Copy>}
    <FlatList horizontal showsHorizontalScrollIndicator data={points} keyExtractor={(point, index) => `${point.label}:${index}`} initialNumToRender={8} maxToRenderPerBatch={12} windowSize={5} getItemLayout={(_, index) => ({ length: 56, offset: 56 * index, index })} contentContainerStyle={{ paddingVertical: 8 }} renderItem={({ item: point, index }) => <Pressable accessibilityRole="button" accessibilityLabel={`${point.label}, ${point.value === null ? "not recorded" : `${point.value} ${unit}`}${point.target == null ? "" : `, target ${point.target} ${unit}`}`} accessibilityState={{ selected: index === (selected ?? points.length - 1) }} onPress={() => setSelected(index)} style={{ width: 56, minHeight: 184, justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
        <View style={{ width: 36, height: 140, justifyContent: "flex-end", borderBottomColor: colors.line, borderBottomWidth: 1 }}>
          {point.value === null ? <AppText tone="muted" style={{ textAlign: "center" }}>—</AppText> : dots ? <View style={{ position: "absolute", bottom: point.value / max * 128, alignSelf: "center", width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent }} /> : <View style={{ height: Math.max(point.value === 0 ? 2 : 3, point.value / max * 132), backgroundColor: colors.accent, borderTopLeftRadius: 5, borderTopRightRadius: 5 }} />}
          {point.target == null ? null : <View style={{ position: "absolute", bottom: point.target / max * 132, width: 36, borderWidth: 1, borderColor: colors.text }} />}
        </View><AppText variant="caption">{point.label.slice(5, 10)}</AppText>
      </Pressable>} />
    <Pressable accessibilityRole="button" onPress={() => setTable(value => !value)} style={{ minHeight: 48, justifyContent: "center" }}><AppText tone="accent">{table ? "Hide recorded values" : "Show all recorded values"}</AppText></Pressable>
    {table ? <>
      {tablePoints.map((point, index) => <MetricRow key={`${point.label}:${page * pageSize + index}`} label={point.label} value={point.value === null ? "Not recorded" : `${point.value} ${unit}`} detail={point.target == null ? undefined : `Target ${point.target} ${unit}`} />)}
      <Copy>{points.length ? `Values ${page * pageSize + 1}–${Math.min((page + 1) * pageSize, points.length)} of ${points.length}` : "No recorded values in this range."}</Copy>
      {points.length > pageSize ? <>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: page === 0 }} disabled={page === 0} onPress={() => setTablePage(page - 1)} style={{ minHeight: 48, justifyContent: "center" }}><AppText tone="accent">Previous value page</AppText></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: (page + 1) * pageSize >= points.length }} disabled={(page + 1) * pageSize >= points.length} onPress={() => setTablePage(page + 1)} style={{ minHeight: 48, justifyContent: "center" }}><AppText tone="accent">Next value page</AppText></Pressable>
      </> : null}
    </> : null}
  </ChartContainer>;
}
