import { useCallback, useMemo, useState, type PropsWithChildren, type ReactNode } from "react";
import { FlatList, Platform } from "react-native";
import { Action, Busy, Card, ConfirmDialog, Copy, DateTimeField, EmptyState, ErrorNote, Field, Page } from "../../components/ui";
import { useApi } from "../../providers/api";
import { useResource } from "../../hooks/use-resource";
import { errorMessage } from "../../lib/api-client";
import { dateOnly, shiftDate } from "../../lib/form-values";
import { onboardingContextData, PAGE_SIZE, rangeDates } from "./data";

export function useTrackingContext() {
  const api = useApi();
  const load = useCallback((signal: AbortSignal) => api.request("get", "/api/v1/onboarding", { signal, cacheMs: 0, validate: onboardingContextData }), [api]);
  const resource = useResource(load);
  const zone = resource.data?.profile?.timezone ?? "UTC";
  return { ...resource, zone, unit: resource.data?.profile?.preferred_weight_unit ?? "kg", today: dateOnly(zone) };
}
export function useHistoryRange(zone: string) {
  const [selection, setSelection] = useState<{ start_date: string; end_date: string }>();
  const end = dateOnly(zone), start = shiftDate(end, -29);
  const range = useMemo(() => selection ?? { start_date: start, end_date: end }, [selection, start, end]);
  const [offset, setOffset] = useState(0);
  return { range, offset, setOffset, apply: (start: string, end: string) => { const value = rangeDates(start, end); setSelection(value); setOffset(0); } };
}
export function ReadStatus({ resource }: { resource: { loading: boolean; error: unknown; reload: () => void; data?: unknown } }) {
  return <>{resource.loading ? <Busy /> : null}{resource.error ? <><ErrorNote message={errorMessage(resource.error)} />{resource.data ? <Copy>Showing previously fetched data. Refresh before editing.</Copy> : null}<Action label="Retry loading" secondary onPress={resource.reload} /></> : null}</>;
}
export function RangeFields({ start, end, onApply }: { start: string; end: string; onApply: (start: string, end: string) => void }) {
  const [from, setFrom] = useState(start), [to, setTo] = useState(end), [error, setError] = useState("");
  return <Card><Field label="History from (YYYY-MM-DD)" value={from} onChangeText={setFrom} autoCapitalize="none" maxLength={10} /><Field label="History to (YYYY-MM-DD)" value={to} onChangeText={setTo} autoCapitalize="none" maxLength={10} />{error ? <ErrorNote message={error} /> : null}<Action label="Apply history dates" secondary onPress={() => { try { onApply(from, to); setError(""); } catch (error) { setError((error as Error).message); } }} /></Card>;
}
export function TimestampField({ label, value, onChange, zone, disabled = false }: { label: string; value: string; onChange: (value: string) => void; zone: string; disabled?: boolean }) {
  const parsed = new Date(value), valid = Number.isFinite(parsed.getTime());
  const nativeZoneSupported = Platform.OS === "ios" || zone === Intl.DateTimeFormat().resolvedOptions().timeZone;
  return <><Field label={`${label} (ISO with offset)`} value={value} onChangeText={onChange} editable={!disabled} autoCapitalize="none" autoCorrect={false} hint={`Profile time zone: ${zone}. Use an explicit offset, e.g. 2026-10-20T22:30:00+05:30. Z means UTC.`} />{valid && !disabled && nativeZoneSupported ? <><DateTimeField label={`${label} date`} mode="date" value={parsed} onChange={date => onChange(date.toISOString())} timeZoneName={zone} /><DateTimeField label={`${label} time`} mode="time" value={parsed} onChange={date => onChange(date.toISOString())} timeZoneName={zone} /></> : null}</>;
}
export function MutationStatus({ mutation, onReconcile, retryable = false }: { mutation: { pending: boolean; error: unknown; uncertain: boolean; retry: () => Promise<unknown>; reset: () => void }; onReconcile: () => void; retryable?: boolean }) {
  const [reviewed, setReviewed] = useState(false);
  return <>{mutation.error ? <ErrorNote message={errorMessage(mutation.error)} /> : null}{mutation.uncertain ? <Card><Copy>The result is unknown. Your original submission is retained. Check saved records before making another change.</Copy><Action label="Refresh saved records" secondary onPress={onReconcile} disabled={mutation.pending} />{retryable ? <Action label="Retry original submission safely" onPress={() => { void mutation.retry(); }} disabled={mutation.pending} /> : <Copy>This operation has no create receipt. Review the current saved value before deciding to submit again.</Copy>}<Action label="I checked saved records" secondary onPress={() => setReviewed(true)} disabled={mutation.pending} /><ConfirmDialog visible={reviewed} title="Finish reconciliation?" message="Only continue when you have checked whether the original change was saved. Starting another create may duplicate it if the first request succeeded." onCancel={() => setReviewed(false)} onConfirm={() => { mutation.reset(); setReviewed(false); }} /></Card> : null}</>;
}
export function HistoryFrame<T extends { id: string }>({ children, rows, renderRow, resource, offset, onPage, empty }: PropsWithChildren<{ rows: T[]; renderRow: (row: T) => ReactNode; resource: { loading: boolean; error: unknown; reload: () => void; data?: unknown }; offset: number; onPage: (offset: number) => void; empty: string }>) {
  const unique = rows.filter((row, index) => rows.findIndex(other => other.id === row.id) === index);
  return <Page scroll={false}><FlatList data={unique} keyExtractor={row => row.id} renderItem={({ item }) => <Card>{renderRow(item)}</Card>} ItemSeparatorComponent={() => <Copy>{" "}</Copy>} keyboardShouldPersistTaps="handled" refreshing={resource.loading} onRefresh={resource.reload} ListHeaderComponent={<>{children}<ReadStatus resource={resource} /></>} ListEmptyComponent={!resource.loading && !resource.error ? <EmptyState title="No entries in this range" message={empty} /> : undefined} ListFooterComponent={<><Copy>History page {Math.floor(offset / PAGE_SIZE) + 1}. Dates use your profile time zone.</Copy><Action label="Newer history page" secondary disabled={resource.loading || offset === 0} onPress={() => onPage(Math.max(0, offset - PAGE_SIZE))} /><Action label="Next history page" secondary disabled={resource.loading || rows.length < PAGE_SIZE} onPress={() => onPage(offset + PAGE_SIZE)} /></>} /></Page>;
}
