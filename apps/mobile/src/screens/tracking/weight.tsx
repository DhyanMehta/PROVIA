import { useCallback, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import Svg, { Circle, Line } from "react-native-svg";
import { Action, Card, ChartContainer, ConfirmDialog, Copy, EmptyState, ErrorNote, Field, MetricRow, Page, SelectField, Title, Value } from "../../components/ui";
import { useApi } from "../../providers/api";
import { useResource } from "../../hooks/use-resource";
import { useMutation } from "../../hooks/use-mutation";
import { ApiError } from "../../lib/api-client";
import { kgToLb } from "../../lib/form-values";
import type { Schema } from "../../lib/contracts";
import { useTheme } from "../../theme";
import { appliedGoalData, goalConfirmation, PAGE_SIZE, pageData, weightBody, weightData, weightPreviewData, type Weight } from "./data";
import { HistoryFrame, MutationStatus, RangeFields, ReadStatus, TimestampField, useHistoryRange, useTrackingContext } from "./shared";
import { useTrackingDraftGuard } from "./draft-guard";

function WeightChart({ rows, unit, zone, target }: { rows: Weight[]; unit: "kg" | "lb"; zone: string; target?: string | null }) {
  const { colors } = useTheme(), [selected, setSelected] = useState<string>();
  const points = [...rows].sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at));
  if (!points.length) return <EmptyState title="Your trend starts with a measurement" message="Only actual saved measurements appear here." />;
  const numeric = (value: string) => Number(unit === "lb" ? kgToLb(value) : value);
  const values = points.map(row => numeric(row.weight_kg));
  const targetValue = target ? numeric(target) : null;
  const low = Math.min(...values, ...(targetValue === null ? [] : [targetValue])), high = Math.max(...values, ...(targetValue === null ? [] : [targetValue]));
  const first = Date.parse(points[0].recorded_at), last = Date.parse(points[points.length - 1].recorded_at);
  const x = (row: Weight) => 20 + (last === first ? 0.5 : (Date.parse(row.recorded_at) - first) / (last - first)) * 280;
  const y = (value: number) => 140 - (high === low ? 0.5 : (value - low) / (high - low)) * 120;
  const chosen = points.find(row => row.id === selected) ?? points[points.length - 1];
  return <ChartContainer title="Measured weight" description="Observed points on this history page. Gaps contain no inferred measurements.">
    <Svg width="100%" height={160} viewBox="0 0 320 160" accessibilityLabel="Weight measurements; use the history entries for each recorded value.">
      <Line x1={20} x2={300} y1={145} y2={145} stroke={colors.line} />
      {targetValue === null ? null : <Line x1={20} x2={300} y1={y(targetValue)} y2={y(targetValue)} stroke={colors.muted} strokeDasharray="5 5" />}
      {points.map(row => <Circle key={row.id} cx={x(row)} cy={y(numeric(row.weight_kg))} r={row.id === chosen.id ? 7 : 5} fill={colors.accent} onPress={() => setSelected(row.id)} />)}
    </Svg>
    <MetricRow label={new Date(chosen.recorded_at).toLocaleString(undefined, { timeZone: zone })} value={`${unit === "lb" ? kgToLb(chosen.weight_kg) : chosen.weight_kg} ${unit}`} />
    <Copy>{new Date(points[0].recorded_at).toLocaleDateString(undefined, { timeZone: zone })} to {new Date(points[points.length - 1].recorded_at).toLocaleDateString(undefined, { timeZone: zone })}. Tap a point to inspect it.</Copy>
    {target ? <Copy>Current goal reference: {unit === "lb" ? kgToLb(target) : target} {unit}. This is a goal, not a measurement.</Copy> : null}
  </ChartContainer>;
}
export function WeightHistoryScreen() {
  const api = useApi(), context = useTrackingContext(), history = useHistoryRange(context.zone);
  const load = useCallback(async (signal: AbortSignal) => {
    if (!context.data) return null;
    const [page, latest] = await Promise.all([
      api.request("get", "/api/v1/weight-logs", { signal, query: { ...history.range, limit: PAGE_SIZE, offset: history.offset }, validate: pageData(weightData) }),
      api.request("get", "/api/v1/weight-logs/latest", { signal, validate: weightData }).catch(error => { if (error instanceof ApiError && error.status === 404) return null; throw error; }),
    ]);
    return { page, latest };
  }, [api, context.data, history.range, history.offset]);
  const resource = useResource(load), data = resource.data;
  return <HistoryFrame rows={data?.page.items ?? []} resource={resource} offset={history.offset} onPage={history.setOffset} empty="Add a measured weight or choose other dates." renderRow={row => <><MetricRow label={new Date(row.recorded_at).toLocaleString(undefined, { timeZone: context.zone })} value={`${context.unit === "lb" ? kgToLb(row.weight_kg) : row.weight_kg} ${context.unit}`} detail={row.source === "health_connect" ? "Health Connect import" : "Manual measurement"} /><Action label="View or edit weight" secondary onPress={() => router.push({ pathname: "/tracking/weight/[weight_id]", params: { weight_id: row.id } })} /></>}>
    <Title eyebrow="Body weight">See your measurements</Title><ReadStatus resource={context} />
    <Action label="Log a measurement" onPress={() => router.push("/tracking/weight/new")} />
    {data ? <><Card><Value label="Latest actual measurement" value={data.latest ? `${context.unit === "lb" ? kgToLb(data.latest.weight_kg) : data.latest.weight_kg} ${context.unit}` : "Not recorded"} /><Copy>Logging weight does not change your profile or nutrition targets. Review a separate goal preview to apply a change.</Copy></Card><WeightChart rows={data.page.items} unit={context.unit} zone={context.zone} target={context.data?.active_goal?.target_weight_kg} /></> : null}
    <RangeFields key={context.zone} start={history.range.start_date} end={history.range.end_date} onApply={history.apply} />
  </HistoryFrame>;
}

export function WeightEntryScreen({ create = false }: { create?: boolean }) {
  const api = useApi(), context = useTrackingContext(), params = useLocalSearchParams<{ weight_id?: string }>();
  const weightId = typeof params.weight_id === "string" ? params.weight_id : "";
  const [valueDraft, setValue] = useState<string>(), [selectedUnit, setUnit] = useState<"kg" | "lb">(), [timeDraft, setTime] = useState<string>(), [initialTime] = useState(() => new Date().toISOString()), [formError, setFormError] = useState(""), [saved, setSaved] = useState<string>(), [confirmDelete, setConfirmDelete] = useState(false);
  const mutation = useMutation(), removal = useMutation();
  const load = useCallback((signal: AbortSignal) => create ? Promise.resolve(null) : api.request("get", "/api/v1/weight-logs/{weight_id}", { signal, cacheMs: 0, params: { weight_id: weightId }, validate: weightData }), [api, create, weightId]);
  const resource = useResource(load);
  const original = resource.data ?? undefined;
  const unit = selectedUnit ?? context.unit;
  const value = valueDraft ?? (original ? unit === "lb" ? kgToLb(original.weight_kg) : original.weight_kg : "");
  const time = timeDraft ?? original?.recorded_at ?? initialTime;
  const locked = mutation.pending || mutation.uncertain || removal.pending || removal.uncertain || !!saved;
  const originalValue = original ? (unit === "lb" ? kgToLb(original.weight_kg) : original.weight_kg) : "";
  const guard = useTrackingDraftGuard(!saved && (create ? !!value.trim() : !!original && (value !== originalValue || time !== original.recorded_at)), mutation.pending || removal.pending, mutation.uncertain || removal.uncertain);
  async function save() {
    try {
      const body = weightBody(value, unit, time); setFormError("");
      // Preserve the exact original kilograms when a rounded lb display was not edited.
      if (!create && original && value === (unit === "lb" ? kgToLb(original.weight_kg) : original.weight_kg)) body.weight_kg = original.weight_kg;
      await mutation.run(async key => {
        const row = create ? await api.request("post", "/api/v1/weight-logs", { body, idempotencyKey: key, validate: weightData }) : await api.request("patch", "/api/v1/weight-logs/{weight_id}", { params: { weight_id: weightId }, body: { weight_kg: body.weight_kg, recorded_at: body.recorded_at }, validate: weightData });
        setSaved(row.id); return row;
      }, { idempotent: create });
    } catch (error) { setFormError((error as Error).message); }
  }
  return <Page>{guard.dialog}<Title eyebrow="Weight">{create ? "Log a measurement" : "Measurement details"}</Title><ReadStatus resource={context} /><ReadStatus resource={resource} />
    {(create || resource.data) ? <>
      <Copy>Stored in kilograms. Your profile and existing goals stay separate from measurements.</Copy>
      {!create ? <Copy>Source: {resource.data?.source === "health_connect" ? "Health Connect import" : "Manual"}. Editing keeps the source identity.</Copy> : null}
      <Field label={`Measured weight (${unit})`} value={value} onChangeText={setValue} keyboardType="decimal-pad" editable={!locked} />
      <SelectField label="Weight unit" value={unit} options={[{ label: "Kilograms", value: "kg" }, { label: "Pounds", value: "lb" }]} disabled={locked} onValueChange={next => { setUnit(next); setValue(""); setFormError("Enter the measurement in the selected unit."); }} />
      <TimestampField label="Measured at" value={time} onChange={setTime} zone={context.zone} disabled={locked} />
      {formError ? <ErrorNote message={formError} /> : null}<MutationStatus mutation={mutation} retryable={create} onReconcile={() => { if (create) router.push("/tracking/weight"); else resource.reload(); }} />
      {mutation.uncertain && resource.data ? <Card><MetricRow label="Latest fetched saved weight" value={`${resource.data.weight_kg} kg`} /><Copy>{new Date(resource.data.recorded_at).toLocaleString(undefined, { timeZone: context.zone })}. Refresh saved records before deciding whether the proposed edit was applied.</Copy></Card> : null}
      {saved ? <Card><Copy>Measurement saved.</Copy><Action label="Return to weight history" onPress={() => router.replace("/tracking/weight")} /><Action label="Review nutrition goal update" secondary onPress={() => router.push({ pathname: "/tracking/weight-goal/[weight_id]", params: { weight_id: saved } })} /></Card> : <Action label={create ? "Save weight" : "Save measurement changes"} loading={mutation.pending} disabled={locked || !context.data} onPress={() => { void save(); }} />}
      {!create && !saved ? <><Action label="Review nutrition goal update" secondary disabled={locked} onPress={() => router.push({ pathname: "/tracking/weight-goal/[weight_id]", params: { weight_id: weightId } })} /><Action label="Delete measurement" variant="danger" disabled={locked} onPress={() => setConfirmDelete(true)} /></> : null}
      <MutationStatus mutation={removal} onReconcile={resource.reload} />
      <ConfirmDialog visible={confirmDelete} title="Delete this measurement?" message="This removes the measurement. It does not change your saved nutrition goals or profile weight." destructive confirmLabel="Delete measurement" busy={removal.pending} onCancel={() => setConfirmDelete(false)} onConfirm={() => { void removal.run(async () => { await api.request("delete", "/api/v1/weight-logs/{weight_id}", { params: { weight_id: weightId } }); setConfirmDelete(false); guard.allowLeave(); router.replace("/tracking/weight"); return true; }); }} />
    </> : null}</Page>;
}

export function WeightGoalScreen() {
  const api = useApi(), params = useLocalSearchParams<{ weight_id?: string }>();
  const weightId = typeof params.weight_id === "string" ? params.weight_id : "";
  const [preview, setPreview] = useState<Schema<"WeightGoalPreview">>(), [confirm, setConfirm] = useState(false), [applied, setApplied] = useState(false), [stale, setStale] = useState(false);
  const request = useMutation(), apply = useMutation();
  const guard = useTrackingDraftGuard(false, apply.pending, apply.uncertain);
  async function loadPreview() {
    if (apply.pending || apply.uncertain) return;
    request.reset();
    setPreview(undefined); setStale(false); apply.reset();
    await request.run(async () => { const result = await api.request("post", "/api/v1/weight-logs/{weight_id}/goal-preview", { params: { weight_id: weightId }, validate: weightPreviewData }); setPreview(result); return result; });
  }
  async function confirmGoal() {
    if (!preview) return;
    const body = goalConfirmation(preview);
    await apply.run(async key => {
      try {
        const result = await api.request("post", "/api/v1/weight-logs/{weight_id}/apply-goal", { params: { weight_id: weightId }, body, idempotencyKey: key, validate: appliedGoalData });
        setApplied(true); setConfirm(false); return result;
      } catch (error) {
        if (error instanceof ApiError && ["GOAL_CHANGED", "WEIGHT_CHANGED"].includes(error.code)) { setPreview(undefined); setStale(true); setConfirm(false); }
        throw error;
      }
    }, { idempotent: true });
  }
  return <Page>{guard.dialog}<Title eyebrow="Explicit goal update">Review before applying</Title><Copy>The server calculates targets from this measurement and your active goal. Logging weight alone never applies these changes.</Copy>
    {stale ? <ErrorNote message="The goal or measured weight changed after the preview. Load a new preview and review it again." /> : null}
    <MutationStatus mutation={request} onReconcile={() => { void loadPreview(); }} />
    {!applied ? <Action label="Calculate fresh goal preview" loading={request.pending} disabled={apply.pending || apply.uncertain} onPress={() => { void loadPreview(); }} /> : null}
    {preview && !applied ? <Card><MetricRow label="Measured weight" value={`${preview.current_weight_kg_snapshot} kg`} /><MetricRow label="Target weight" value={`${preview.target_weight_kg} kg`} /><MetricRow label="Maintenance" value={`${preview.maintenance_calories} kcal`} /><MetricRow label="Daily calorie target" value={`${preview.daily_calorie_target} kcal`} />{(["protein", "carbs", "fat", "fiber"] as const).map(key => <MetricRow key={key} label={key} value={`${preview[`${key}_target_g`]} g`} />)}<Copy>Calculated estimates · {preview.calculation_method} · {preview.calculation_version}. Applying creates a new goal revision; historical snapshots remain intact.</Copy><Action label="Review and apply these targets" disabled={apply.pending || apply.uncertain} onPress={() => setConfirm(true)} /></Card> : null}
    <MutationStatus mutation={apply} retryable onReconcile={() => router.push("/tracking/weight")} />
    {applied ? <Card><Copy>Your updated goal is saved.</Copy><Action label="Back to tracking" onPress={() => router.replace("/(tabs)/tracking")} /></Card> : null}
    <ConfirmDialog visible={confirm} title="Apply these nutrition targets?" message={preview ? `Use the reviewed ${preview.current_weight_kg_snapshot} kg measurement and ${preview.daily_calorie_target} kcal daily target? The server checks that the goal and weight still match this preview.` : "A fresh preview is required."} confirmLabel="Apply reviewed goal" busy={apply.pending} onCancel={() => setConfirm(false)} onConfirm={() => { void confirmGoal(); }} />
  </Page>;
}
