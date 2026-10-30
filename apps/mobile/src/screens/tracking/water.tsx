import { useCallback, useState } from "react";
import { Action, Card, ConfirmDialog, Copy, ErrorNote, Field, MetricRow, ProgressBar, Title, Value } from "../../components/ui";
import { useApi } from "../../providers/api";
import { useResource } from "../../hooks/use-resource";
import { useMutation } from "../../hooks/use-mutation";
import { decimalInput } from "../../lib/form-values";
import { calendarDate, PAGE_SIZE, pageData, targetData, waterBody, waterDashboardData, waterData, type Water } from "./data";
import { HistoryFrame, MutationStatus, RangeFields, ReadStatus, TimestampField, useHistoryRange, useTrackingContext } from "./shared";
import { useTrackingDraftGuard } from "./draft-guard";

export function WaterScreen() {
  const api = useApi(), context = useTrackingContext(), history = useHistoryRange(context.zone);
  const [selectedDate, setSelectedDate] = useState(""), [dateDraft, setDateDraft] = useState("");
  const day = selectedDate || context.today;
  const [amount, setAmount] = useState(""), [time, setTime] = useState(() => new Date().toISOString()), [editing, setEditing] = useState<Water>(), [target, setTarget] = useState(""), [effectiveDate, setEffectiveDate] = useState(""), [formError, setFormError] = useState(""), [message, setMessage] = useState(""), [deleting, setDeleting] = useState<Water>(), [confirmTarget, setConfirmTarget] = useState(false);
  const mutation = useMutation(), targetMutation = useMutation(), removal = useMutation();
  const load = useCallback(async (signal: AbortSignal) => {
    if (!context.data) return null;
    const [dashboard, page] = await Promise.all([
      api.request("get", "/api/v1/water/dashboard", { signal, query: { date: day }, validate: waterDashboardData }),
      api.request("get", "/api/v1/water-logs", { signal, query: { ...history.range, limit: PAGE_SIZE, offset: history.offset }, validate: pageData(waterData) }),
    ]); return { dashboard, page };
  }, [api, context.data, day, history.range, history.offset]);
  const resource = useResource(load), data = resource.data;
  const locked = mutation.pending || mutation.uncertain || removal.pending || removal.uncertain || targetMutation.pending || targetMutation.uncertain;
  const entryDirty = editing ? amount !== editing.amount_ml || time !== editing.consumed_at : !!amount.trim();
  const guard = useTrackingDraftGuard(entryDirty || !!target.trim(), mutation.pending || targetMutation.pending || removal.pending, mutation.uncertain || targetMutation.uncertain || removal.uncertain);
  function clearEditor() { setEditing(undefined); setAmount(""); setTime(new Date().toISOString()); }
  async function save() {
    try {
      const body = waterBody(amount, time), id = editing?.id; setFormError(""); setMessage("");
      await mutation.run(async key => {
        const row = id ? await api.request("patch", "/api/v1/water-logs/{log_id}", { params: { log_id: id }, body, validate: waterData }) : await api.request("post", "/api/v1/water-logs", { body, idempotencyKey: key, validate: waterData });
        clearEditor(); setMessage(id ? "Water entry updated." : "Water entry saved."); resource.reload(); return row;
      }, { idempotent: !id });
    } catch (error) { setFormError((error as Error).message); }
  }
  async function saveTarget() {
    try {
      const date = effectiveDate || day;
      if (!calendarDate(date)) throw new Error("Enter the target effective date as YYYY-MM-DD.");
      const target_ml = decimalInput(target, "daily target", 0, 20000);
      if (Number(target_ml) <= 0) throw new Error("Daily target must be greater than zero.");
      const body = { effective_date: date, target_ml }; setFormError("");
      await targetMutation.run(async () => { const row = await api.request("put", "/api/v1/water/target", { body, validate: targetData }); setConfirmTarget(false); setTarget(""); setMessage("Daily target saved from its effective date."); resource.reload(); return row; });
    } catch (error) { setConfirmTarget(false); setFormError((error as Error).message); }
  }
  return <HistoryFrame rows={data?.page.items ?? []} resource={resource} offset={history.offset} onPage={history.setOffset} empty="Log water or choose another date range." renderRow={row => <><MetricRow label={new Date(row.consumed_at).toLocaleString(undefined, { timeZone: context.zone })} value={`${row.amount_ml} ml`} /><Action label="Edit water entry" secondary disabled={locked || !!resource.error} onPress={() => guard.requestDiscard(() => { mutation.reset(); setEditing(row); setAmount(row.amount_ml); setTime(row.consumed_at); setMessage(""); }, entryDirty)} /><Action label="Delete water entry" variant="danger" disabled={locked || !!resource.error} onPress={() => setDeleting(row)} /></>}>
    {guard.dialog}<Title eyebrow="Hydration">Water, throughout your day</Title><ReadStatus resource={context} />
    <Card><Field label="Water day (YYYY-MM-DD)" value={dateDraft || day} onChangeText={setDateDraft} maxLength={10} /><Action label="Show water day" secondary onPress={() => { if (calendarDate(dateDraft || day)) { setSelectedDate(dateDraft || day); setFormError(""); } else setFormError("Enter a valid calendar date as YYYY-MM-DD."); }} />
      {data ? <><Value label={`Water · ${data.dashboard.date}`} value={data.dashboard.has_logs ? `${data.dashboard.consumed_ml} ml` : "No water logged"} /><MetricRow label="Daily target" value={data.dashboard.target_ml === null ? "Not set" : `${data.dashboard.target_ml} ml`} /><MetricRow label="Remaining" value={data.dashboard.remaining_ml === null ? "Unknown until a target is set" : `${data.dashboard.remaining_ml} ml`} /><ProgressBar label="Water target progress" value={data.dashboard.target_ml !== null && Number(data.dashboard.target_ml) > 0 && data.dashboard.has_logs ? Number(data.dashboard.consumed_ml) / Number(data.dashboard.target_ml) : null} /></> : null}
    </Card>
    <Card><Title>{editing ? "Edit water" : "Add water"}</Title><Field label="Water amount (ml)" value={amount} onChangeText={setAmount} editable={!locked} keyboardType="decimal-pad" />
      {!editing ? <>{[150, 250, 500].map(value => <Action key={value} label={`Choose ${value} ml`} secondary disabled={locked} onPress={() => setAmount(String(value))} />)}<Copy>Presets fill the amount; they do not save an entry.</Copy></> : null}
      <TimestampField label="Consumed at" value={time} onChange={setTime} zone={context.zone} disabled={locked} />
      <Action label={editing ? "Save water changes" : "Save water entry"} loading={mutation.pending} disabled={locked || !context.data || !!resource.error} onPress={() => { void save(); }} />{editing ? <Action label="Cancel water edit" secondary disabled={locked} onPress={() => guard.requestDiscard(clearEditor, entryDirty)} /> : null}
      <MutationStatus mutation={mutation} retryable={!editing} onReconcile={resource.reload} />
    </Card>
    <Card><Title>Daily target</Title><Copy>Set your own target in milliliters. It applies from its effective date until another saved target. PROVIA does not assume a recommended amount.</Copy><Field label="Target amount (ml)" value={target} onChangeText={setTarget} keyboardType="decimal-pad" editable={!locked} /><Field label="Target effective date (YYYY-MM-DD)" value={effectiveDate || day} onChangeText={setEffectiveDate} editable={!locked} maxLength={10} /><Action label="Review daily target" secondary disabled={locked || !target || !context.data} onPress={() => setConfirmTarget(true)} /><MutationStatus mutation={targetMutation} onReconcile={resource.reload} /></Card>
    {formError ? <ErrorNote message={formError} /> : null}{message ? <Copy>{message}</Copy> : null}<MutationStatus mutation={removal} onReconcile={resource.reload} />
    <RangeFields key={context.zone} start={history.range.start_date} end={history.range.end_date} onApply={history.apply} />
    <ConfirmDialog visible={!!deleting} title="Delete this water entry?" message={deleting ? `Remove the ${deleting.amount_ml} ml entry? Daily totals will update after confirmation.` : ""} destructive confirmLabel="Delete water entry" busy={removal.pending} onCancel={() => setDeleting(undefined)} onConfirm={() => { const id = deleting?.id; if (id) void removal.run(async () => { await api.request("delete", "/api/v1/water-logs/{log_id}", { params: { log_id: id } }); if (editing?.id === id) clearEditor(); setDeleting(undefined); setMessage("Water entry deleted."); resource.reload(); return true; }); }} />
    <ConfirmDialog visible={confirmTarget} title="Save this daily target?" message={`Use ${target} ml from ${effectiveDate || day}? This replaces any target already saved for that effective date.`} confirmLabel="Save daily target" busy={targetMutation.pending} onCancel={() => setConfirmTarget(false)} onConfirm={() => { void saveTarget(); }} />
  </HistoryFrame>;
}
