import { useState, type PropsWithChildren } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Action, AppText, Card, Copy, ErrorNote, ErrorState, Field, LoadingSkeleton } from "../../components/ui";
import { ApiError, errorMessage } from "../../lib/api-client";
import type { useMutation } from "../../hooks/use-mutation";
import { dateRange } from "./data";

export function inputError(error: unknown) { return error instanceof ApiError ? errorMessage(error) : error instanceof Error ? error.message : "Check the values entered."; }

export function useRouteId(key: string): string {
  const params = useLocalSearchParams();
  const value = params[key];
  return typeof value === "string" ? value : "";
}
export function LoadState({ resource, children }: PropsWithChildren<{ resource: { data?: unknown; error: unknown; loading: boolean; reload: () => void } }>) {
  return <>{resource.error ? <ErrorState message={errorMessage(resource.error)} onRetry={resource.reload} /> : null}{!resource.data && resource.loading ? <LoadingSkeleton /> : null}{children}</>;
}
export function MutationState({ mutation, canRetry = false, onReconcile }: { mutation: ReturnType<typeof useMutation>; canRetry?: boolean; onReconcile?: () => void }) {
  return <>{mutation.error ? <ErrorNote message={errorMessage(mutation.error)} /> : null}{mutation.uncertain ? <Card><AppText variant="heading">Check the save result</AppText><Copy>Your request may already have been saved. Reconnect before continuing.</Copy>{canRetry ? <Action label="Retry the same request" onPress={() => { void mutation.retry(); }} loading={mutation.pending} /> : onReconcile ? <Action label="Reload saved data to reconcile" onPress={onReconcile} disabled={mutation.pending} /> : <Copy>Reopen this screen to inspect saved data before editing again.</Copy>}</Card> : null}</>;
}
export function Pager({ offset, count, onChange }: { offset: number; count: number; onChange: (v: number) => void }) {
  return <View style={{ gap: 8 }}><AppText variant="caption" tone="muted">Results {count ? offset + 1 : 0}–{offset + count}</AppText><Action label="Previous page" onPress={() => onChange(Math.max(0, offset - 20))} disabled={offset === 0} secondary /><Action label="Next page" onPress={() => onChange(offset + 20)} disabled={count < 20} secondary /></View>;
}
export function RangeFields({ initial, onApply }: { initial: { start_date: string; end_date: string }; onApply: (v: { start_date: string; end_date: string }) => void }) {
  const [start, setStart] = useState(initial.start_date);
  const [end, setEnd] = useState(initial.end_date);
  const [error, setError] = useState<string>();
  return <Card><Field label="Start date" hint="YYYY-MM-DD, in your profile time zone" value={start} onChangeText={setStart} autoCapitalize="none" /><Field label="End date" value={end} onChangeText={setEnd} autoCapitalize="none" /><ErrorNote message={error} /><Action label="Apply date range" secondary onPress={() => { try { onApply(dateRange(start, end)); setError(undefined); } catch (e) { setError(inputError(e)); } }} /></Card>;
}
