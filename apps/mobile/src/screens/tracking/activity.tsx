import { useCallback, useState } from "react";
import { Action, Card, ConfirmDialog, Copy, ErrorNote, Field, MetricRow, Title, Value } from "../../components/ui";
import { useApi } from "../../providers/api";
import { useResource } from "../../hooks/use-resource";
import { useMutation } from "../../hooks/use-mutation";
import type { Schema } from "../../lib/contracts";
import { activityBody, activityData, activitySummaryData, calendarDate, PAGE_SIZE, pageData, type Activity } from "./data";
import { HistoryFrame, MutationStatus, RangeFields, ReadStatus, useHistoryRange, useTrackingContext } from "./shared";
import { useTrackingDraftGuard } from "./draft-guard";

export function ActivityScreen() {
  const api = useApi(), context = useTrackingContext(), history = useHistoryRange(context.zone);
  const [selectedDate, setSelectedDate] = useState(""), [dateDraft, setDateDraft] = useState("");
  const day = selectedDate || context.today;
  const [steps, setSteps] = useState(""), [distance, setDistance] = useState(""), [minutes, setMinutes] = useState(""), [calories, setCalories] = useState(""), [formError, setFormError] = useState(""), [message, setMessage] = useState(""), [review, setReview] = useState<Schema<"ActivityPut">>(), [deleteDay, setDeleteDay] = useState<string>();
  const mutation = useMutation(), removal = useMutation();
  const load = useCallback(async (signal: AbortSignal) => {
    if (!context.data) return null;
    const [daily, page, summary] = await Promise.all([
      api.request("get", "/api/v1/activity/daily", { signal, query: { date: day }, validate: row => row === null || activityData(row) }),
      api.request("get", "/api/v1/activity", { signal, query: { ...history.range, limit: PAGE_SIZE, offset: history.offset }, validate: pageData(activityData) }),
      api.request("get", "/api/v1/activity/summary", { signal, query: history.range, validate: activitySummaryData }),
    ]); return { daily, page, summary };
  }, [api, context.data, day, history.range, history.offset]);
  const resource = useResource(load), data = resource.data;
  const locked = mutation.pending || mutation.uncertain || removal.pending || removal.uncertain;
  const guard = useTrackingDraftGuard(!message && [steps, distance, minutes, calories].some(value => value.trim().length > 0), mutation.pending || removal.pending, mutation.uncertain || removal.uncertain);
  function fillSaved(row: Activity) {
    setSelectedDate(row.activity_date); setDateDraft(row.activity_date); setSteps(String(row.steps)); setDistance(row.distance_m ?? ""); setMinutes(row.active_minutes === null ? "" : String(row.active_minutes)); setCalories(row.activity_calories ?? ""); setMessage(""); mutation.reset();
  }
  function showDay() {
    if (!calendarDate(dateDraft || day)) { setFormError("Enter a valid calendar date as YYYY-MM-DD."); return; }
    setSelectedDate(dateDraft || day); setSteps(""); setDistance(""); setMinutes(""); setCalories(""); setFormError(""); setMessage("");
  }
  const imported = data?.daily?.source === "health_connect";
  function reviewDay() { try { setReview(activityBody(day, steps, distance, minutes, calories)); setFormError(""); } catch (error) { setFormError((error as Error).message); } }
  async function save() {
    if (!review) return;
    const body = review;
    await mutation.run(async () => { const row = await api.request("put", "/api/v1/activity/daily", { body, validate: activityData }); setReview(undefined); setMessage("Complete daily activity saved."); resource.reload(); return row; });
  }
  return <HistoryFrame rows={data?.page.items ?? []} resource={resource} offset={history.offset} onPage={history.setOffset} empty="No daily activity was recorded in this range. Missing days are not zero-step days." renderRow={row => <><MetricRow label={row.activity_date} value={`${row.steps.toLocaleString()} steps`} detail={row.source === "health_connect" ? "Health Connect snapshot" : "Manual daily total"} /><MetricRow label="Distance" value={row.distance_m === null ? "Unknown" : `${row.distance_m} m`} /><MetricRow label="Active minutes" value={row.active_minutes === null ? "Unknown" : String(row.active_minutes)} /><Action label="Open activity day" secondary disabled={locked} onPress={() => fillSaved(row)} /><Action label="Delete activity day" variant="danger" disabled={locked || !!resource.error} onPress={() => setDeleteDay(row.activity_date)} /></>}>
    {guard.dialog}<Title eyebrow="Movement">Steps and activity</Title><ReadStatus resource={context} />
    <Card><Field label="Activity date (YYYY-MM-DD)" value={dateDraft || day} onChangeText={setDateDraft} editable={!locked} maxLength={10} /><Action label="Show activity day" secondary onPress={showDay} disabled={locked} />
      {data ? <><Value label={`Steps · ${day}`} value={data.daily ? data.daily.steps.toLocaleString() : "Not recorded"} /><Copy>{data.daily ? `Source: ${data.daily.source === "health_connect" ? "Health Connect" : "Manual"}` : "No activity snapshot exists for this date."}</Copy>{data.daily ? <><MetricRow label="Active calories" value={data.daily.activity_calories === null ? "Unknown" : `${data.daily.activity_calories} kcal`} /><Action label="Load saved values into form" secondary disabled={locked || imported} onPress={() => { if (data.daily) fillSaved(data.daily); }} /></> : null}<MetricRow label="Observed days in history range" value={String(data.summary.observed_days)} /><MetricRow label="Total steps on recorded days" value={data.summary.total_steps === null ? "Not recorded" : data.summary.total_steps.toLocaleString()} /></> : null}
    </Card>
    <Card><Title>Complete manual daily total</Title><Copy>Saving replaces the entire selected day. Optional fields left blank become unknown. These values are not added to the previous total. Active calories do not increase your nutrition budget.</Copy>
      {imported ? <ErrorNote message="This day contains an imported Health Connect snapshot. Manual values cannot replace it. You can review or explicitly delete the saved day." /> : null}
      <Field label="Daily steps" value={steps} onChangeText={setSteps} keyboardType="number-pad" editable={!locked && !imported} /><Field label="Distance (m, optional)" value={distance} onChangeText={setDistance} keyboardType="decimal-pad" editable={!locked && !imported} /><Field label="Active minutes (optional)" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" editable={!locked && !imported} /><Field label="Active calories (kcal, optional)" value={calories} onChangeText={setCalories} keyboardType="decimal-pad" editable={!locked && !imported} />
      <Action label="Review full-day replacement" disabled={locked || imported || !context.data || resource.loading || !!resource.error} onPress={reviewDay} /><MutationStatus mutation={mutation} onReconcile={resource.reload} />
    </Card>
    {formError ? <ErrorNote message={formError} /> : null}{message ? <Copy>{message}</Copy> : null}<MutationStatus mutation={removal} onReconcile={resource.reload} />
    <RangeFields key={context.zone} start={history.range.start_date} end={history.range.end_date} onApply={history.apply} />
    <ConfirmDialog visible={!!review} title="Replace this complete day?" message={review ? `Save ${review.steps} steps for ${review.activity_date}? Distance, active minutes and active calories will be replaced by the form values; blank values become unknown.` : ""} confirmLabel="Save complete daily total" busy={mutation.pending} onCancel={() => setReview(undefined)} onConfirm={() => { void save(); }} />
    <ConfirmDialog visible={!!deleteDay} title="Delete this activity day?" message={`Remove the saved snapshot for ${deleteDay ?? "this date"}? No zero-step reading or earlier manual value will be substituted.`} destructive confirmLabel="Delete daily activity" busy={removal.pending} onCancel={() => setDeleteDay(undefined)} onConfirm={() => { const date = deleteDay; if (date) void removal.run(async () => { await api.request("delete", "/api/v1/activity/daily", { query: { date } }); setDeleteDay(undefined); setMessage("Daily activity deleted."); resource.reload(); return true; }); }} />
  </HistoryFrame>;
}
