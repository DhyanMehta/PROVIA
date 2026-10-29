import { useCallback, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import Svg, { Circle, Line } from "react-native-svg";
import { Action, Card, ChartContainer, ConfirmDialog, Copy, ErrorNote, Field, MetricRow, Page, Title, Value } from "../../components/ui";
import { useApi } from "../../providers/api";
import { useResource } from "../../hooks/use-resource";
import { useMutation } from "../../hooks/use-mutation";
import type { Schema } from "../../lib/contracts";
import { useTheme } from "../../theme";
import { elapsedLabel, PAGE_SIZE, pageData, sleepBody, sleepData, sleepSummaryData } from "./data";
import { HistoryFrame, MutationStatus, RangeFields, ReadStatus, TimestampField, useHistoryRange, useTrackingContext } from "./shared";
import { useTrackingDraftGuard } from "./draft-guard";

function SleepTrend({ points }: { points: Schema<"SleepPoint">[] }) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<string>();
  const observations = points.filter(point => point.duration_seconds !== null);
  const chosen = points.find(point => point.date === selected) ?? observations[observations.length - 1];
  const high = Math.max(3600, ...observations.map(point => point.duration_seconds!));
  return <ChartContainer title="Sleep by wake-up day" description="Saved elapsed session duration. Missing days stay unknown; no gaps are filled.">
    {observations.length ? <>
      <Svg width="100%" height={160} viewBox="0 0 320 160" accessibilityLabel="Sleep duration points. Each date and value is also listed below.">
        <Line x1={20} x2={300} y1={145} y2={145} stroke={colors.line} />
        {points.map((point, index) => point.duration_seconds === null ? null : <Circle key={point.date} cx={20 + (points.length === 1 ? .5 : index / (points.length - 1)) * 280} cy={140 - point.duration_seconds / high * 120} r={point.date === chosen?.date ? 7 : 5} fill={colors.accent} onPress={() => setSelected(point.date)} />)}
      </Svg>
      {chosen ? <MetricRow label={chosen.date} value={elapsedLabel(chosen.duration_seconds)} /> : null}
      <Copy>Tap an observed point to inspect its wake-up day. Elapsed duration includes awake stages.</Copy>
    </> : <Copy>No sleep duration recorded in this range.</Copy>}
    {points.map(point => <MetricRow key={point.date} label={point.date} value={elapsedLabel(point.duration_seconds)} />)}
  </ChartContainer>;
}

export function SleepHistoryScreen() {
  const api = useApi(), context = useTrackingContext(), history = useHistoryRange(context.zone);
  const load = useCallback(async (signal: AbortSignal) => {
    if (!context.data) return null;
    const [page, summary] = await Promise.all([
      api.request("get", "/api/v1/sleep-sessions", { signal, query: { ...history.range, limit: PAGE_SIZE, offset: history.offset }, validate: pageData(sleepData) }),
      api.request("get", "/api/v1/sleep/summary", { signal, query: history.range, validate: sleepSummaryData }),
    ]);
    return { page, summary };
  }, [api, context.data, history.range, history.offset]);
  const resource = useResource(load);
  return <HistoryFrame rows={resource.data?.page.items ?? []} resource={resource} offset={history.offset} onPage={history.setOffset} empty="No saved sleep sessions in this wake-date range. Log a session or choose other dates." renderRow={row => <>
    <MetricRow label={new Date(row.ended_at).toLocaleDateString(undefined, { timeZone: context.zone })} value={elapsedLabel(row.duration_seconds)} detail={row.source === "health_connect" ? "Health Connect import" : "Manual sleep session"} />
    <Copy>{new Date(row.started_at).toLocaleString(undefined, { timeZone: context.zone })} to {new Date(row.ended_at).toLocaleString(undefined, { timeZone: context.zone })}</Copy>
    <Action label="View or edit sleep" secondary onPress={() => router.push({ pathname: "/tracking/sleep/[session_id]", params: { session_id: row.id } })} />
  </>}>
    <Title eyebrow="Rest and recovery">Your sleep, recorded</Title><ReadStatus resource={context} />
    <Copy>Sessions belong to their local wake-up date in {context.zone}. Overnight entries and daylight-saving changes use actual elapsed time.</Copy>
    <Action label="Log sleep session" onPress={() => router.push("/tracking/sleep/new")} />
    {resource.data ? <SleepTrend points={resource.data.summary.daily} /> : null}
    <RangeFields key={context.zone} start={history.range.start_date} end={history.range.end_date} onApply={history.apply} />
  </HistoryFrame>;
}

export function SleepEntryScreen({ create = false }: { create?: boolean }) {
  const api = useApi(), context = useTrackingContext(), params = useLocalSearchParams<{ session_id?: string }>();
  const sessionId = typeof params.session_id === "string" ? params.session_id : "";
  const [initial] = useState(() => ({ start: new Date(Date.now() - 8 * 3600000).toISOString(), end: new Date().toISOString() }));
  const [startDraft, setStart] = useState<string>();
  const [endDraft, setEnd] = useState<string>();
  const [notesDraft, setNotes] = useState<string>(), [formError, setFormError] = useState(""), [saved, setSaved] = useState(false), [confirmDelete, setConfirmDelete] = useState(false);
  const mutation = useMutation(), removal = useMutation();
  const load = useCallback((signal: AbortSignal) => create ? Promise.resolve(null) : api.request("get", "/api/v1/sleep-sessions/{session_id}", { signal, cacheMs: 0, params: { session_id: sessionId }, validate: sleepData }), [api, create, sessionId]);
  const resource = useResource(load);
  const original = resource.data ?? undefined;
  const start = startDraft ?? original?.started_at ?? initial.start;
  const end = endDraft ?? original?.ended_at ?? initial.end;
  const notes = notesDraft ?? original?.notes ?? "";
  const locked = mutation.pending || mutation.uncertain || removal.pending || removal.uncertain || saved;
  const guard = useTrackingDraftGuard(!saved && (create ? !!notes.trim() || start !== initial.start || end !== initial.end : !!original && (start !== original.started_at || end !== original.ended_at || notes !== (original.notes ?? ""))), mutation.pending || removal.pending, mutation.uncertain || removal.uncertain);
  async function save() {
    try {
      const body = sleepBody(start, end, notes);
      // Existing stages are never dropped by a notes/time edit. The server checks
      // that the unchanged stage intervals remain inside the proposed interval.
      setFormError("");
      await mutation.run(async key => {
        const row = create
          ? await api.request("post", "/api/v1/sleep-sessions", { body, idempotencyKey: key, validate: sleepData })
          : await api.request("patch", "/api/v1/sleep-sessions/{session_id}", { params: { session_id: sessionId }, body: { started_at: body.started_at, ended_at: body.ended_at, notes: body.notes }, validate: sleepData });
        setSaved(true); return row;
      }, { idempotent: create });
    } catch (error) { setFormError((error as Error).message); }
  }
  return <Page>{guard.dialog}<Title eyebrow="Sleep">{create ? "Log a sleep session" : "Sleep session details"}</Title><ReadStatus resource={context} /><ReadStatus resource={resource} />
    {(create || resource.data) ? <>
      <Copy>Use actual start and wake-up instants. Sessions must last more than zero and no more than 24 hours, and cannot overlap another saved session.</Copy>
      {original ? <Copy>Source: {original.source === "health_connect" ? "Health Connect import" : "Manual"}. Source identity stays attached to this entry.</Copy> : <Copy>Suggested times are editable inputs, not a saved sleep record.</Copy>}
      <TimestampField label="Sleep started" value={start} onChange={setStart} zone={context.zone} disabled={locked} />
      <TimestampField label="Sleep ended" value={end} onChange={setEnd} zone={context.zone} disabled={locked} />
      <Field label="Sleep notes (optional)" value={notes} onChangeText={setNotes} multiline maxLength={4000} editable={!locked} />
      {original ? <Card><Value label="Saved elapsed duration" value={elapsedLabel(original.duration_seconds)} />
        {original.stages?.length ? <><Title>Recorded stages</Title><Copy>Stages are shown exactly as supplied. Editing notes or timestamps preserves them; no stages are inferred.</Copy>{original.stages.map((stage, index) => <MetricRow key={`${stage.started_at}-${index}`} label={stage.stage} value={`${new Date(stage.started_at).toLocaleTimeString(undefined, { timeZone: context.zone })} – ${new Date(stage.ended_at).toLocaleTimeString(undefined, { timeZone: context.zone })}`} />)}</> : <Copy>No sleep stages were supplied. PROVIA does not infer deep, light or REM sleep.</Copy>}
      </Card> : null}
      {formError ? <ErrorNote message={formError} /> : null}
      <MutationStatus mutation={mutation} retryable={create} onReconcile={() => { if (create) router.push("/tracking/sleep"); else resource.reload(); }} />
      {mutation.uncertain && resource.data ? <Card><Title>Latest fetched saved session</Title><Copy>{new Date(resource.data.started_at).toLocaleString(undefined, { timeZone: context.zone })} to {new Date(resource.data.ended_at).toLocaleString(undefined, { timeZone: context.zone })}</Copy><MetricRow label="Saved elapsed duration" value={elapsedLabel(resource.data.duration_seconds)} /><Copy>{resource.data.notes ?? "No saved notes"}</Copy></Card> : null}
      {saved ? <Card><Copy>Sleep session saved.</Copy><Action label="Return to sleep history" onPress={() => router.replace("/tracking/sleep")} /></Card> : <Action label={create ? "Save sleep session" : "Save sleep changes"} loading={mutation.pending} disabled={locked || !context.data || !!resource.error} onPress={() => { void save(); }} />}
      {!create && !saved ? <Action label="Delete sleep session" variant="danger" disabled={locked || !!resource.error} onPress={() => setConfirmDelete(true)} /> : null}
      <MutationStatus mutation={removal} onReconcile={resource.reload} />
      <ConfirmDialog visible={confirmDelete} title="Delete this sleep session?" message="This removes the session and its recorded stages. Your sleep history and daily totals will update." destructive confirmLabel="Delete sleep session" busy={removal.pending} onCancel={() => setConfirmDelete(false)} onConfirm={() => { void removal.run(async () => { await api.request("delete", "/api/v1/sleep-sessions/{session_id}", { params: { session_id: sessionId } }); setConfirmDelete(false); guard.allowLeave(); router.replace("/tracking/sleep"); return true; }); }} />
    </> : null}
  </Page>;
}
