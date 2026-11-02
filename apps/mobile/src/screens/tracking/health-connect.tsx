import { useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { router } from "expo-router";
import { Action, Card, ConfirmDialog, Copy, ErrorNote, MetricRow, Page, Title } from "../../components/ui";
import { useAuth } from "../../providers/auth";
import { useApi } from "../../providers/api";
import { shiftDate } from "../../lib/form-values";
import { nativeHealth, nativeLedger, receiptIdentity } from "../../lib/health-connect/native";
import { createHealthSync, type Category, type Outcome } from "../../lib/health-connect/sync";
import { ReadStatus, useTrackingContext } from "./shared";

const labels: Record<Category, string> = { steps: "Steps", weight: "Weight", sleep: "Sleep" };
export function HealthConnectScreen() {
  const { userId, session } = useAuth();
  const api = useApi(), context = useTrackingContext();
  const [availability, setAvailability] = useState("Not checked"), [permissions, setPermissions] = useState<Category[]>([]);
  const [selected, setSelected] = useState<Category[]>([]), [results, setResults] = useState<Outcome[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string>(), [lastSync, setLastSync] = useState<string | null>(null);
  const [confirmSteps, setConfirmSteps] = useState(false);
  const mounted = useRef(true), lock = useRef(false), abort = useRef<AbortController | null>(null);
  const generation = session.getGeneration();
  const runtime = useMemo(() => {
    if (!userId) return null;
    const ledger = nativeLedger(userId);
    return { ledger, sync: createHealthSync({ accountId: userId, api, native: nativeHealth, ledger, identity: value => receiptIdentity(userId, value), current: () => AppState.currentState === "active" && session.getGeneration() === generation && session.getSnapshot().user?.id === userId }) };
  }, [userId, session, generation, api]);
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener("change", state => { if (state !== "active") abort.current?.abort(); });
    return () => { mounted.current = false; abort.current?.abort(); runtime?.sync.cancel(); subscription.remove(); };
  }, [runtime]);
  const work = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(undefined);
    try { await action(); } catch { if (mounted.current && session.getGeneration() === generation && session.getSnapshot().user?.id === userId) setError("This operation could not finish. Health Connect requires a compatible Android build and permissions. Review saved tracking records before retrying a sync."); }
    finally { lock.current = false; if (mounted.current && session.getGeneration() === generation && session.getSnapshot().user?.id === userId) setBusy(false); }
  };
  const inspect = async () => {
    const status = await nativeHealth.availability();
    if (!mounted.current || session.getGeneration() !== generation || session.getSnapshot().user?.id !== userId) return;
    setAvailability(status === "available" ? "Available" : status === "update_required" ? "Provider update required" : "Unavailable on this platform/build");
    setPermissions(status === "available" ? await nativeHealth.permissions() : []);
    if (runtime) setLastSync(await runtime.ledger.get("last-success"));
  };
  const day = shiftDate(context.today, -1);
  const syncNow = () => { void work(async () => { if (!runtime) return; const controller = new AbortController(); abort.current = controller; const outcome = await runtime.sync.sync(day, context.zone, selected, controller.signal); if (mounted.current && session.getGeneration() === generation && session.getSnapshot().user?.id === userId) { setResults(outcome); setLastSync(await runtime.ledger.get("last-success")); } }); };
  return <Page><Title eyebrow="Android integration">Health Connect</Title>
    <ReadStatus resource={context} />
    <Card><Title>Your device, your choice</Title><Copy>Connect Health Connect to import the categories you choose. Checks and imports happen only when you request them. No background reads or automatic uploads run.</Copy>
      <MetricRow label="Device availability" value={availability} /><MetricRow label="Last checked read permissions" value={permissions.length ? permissions.map(value => labels[value]).join(", ") : "None checked/granted"} />
      <MetricRow label="Last fully successful sync" value={lastSync ?? "Not recorded for this account"} />
      <Action label="Check availability and permissions" secondary disabled={busy} onPress={() => { void work(inspect); }} />
    </Card>
    <Card><Title>Choose data to import</Title><Copy>These Android records may include data from other apps/devices. Select only your own data for this signed-in account. Permission denial or missing data is never uploaded as zero. Revoking access stops future reads; it does not erase saved PROVIA records.</Copy>
      {(["steps", "weight", "sleep"] as Category[]).map(category => <Action key={category} label={`${selected.includes(category) ? "Selected" : "Select"}: ${labels[category]}`} secondary disabled={busy} onPress={() => setSelected(previous => previous.includes(category) ? previous.filter(value => value !== category) : [...previous, category])} />)}
      <Action label="Grant selected read permissions" disabled={busy || !selected.length} onPress={() => { void work(async () => { if (await nativeHealth.availability() !== "available") throw new Error(); const granted = await nativeHealth.request(selected); if (mounted.current && session.getGeneration() === generation && session.getSnapshot().user?.id === userId) { setPermissions(granted); setAvailability("Available"); } }); }} />
      <Action label="Health data privacy" secondary disabled={busy} onPress={() => router.push("/health-privacy")} />
      <Action label="Manage permissions in Health Connect" secondary disabled={busy} onPress={() => { void work(() => nativeHealth.manage()); }} />
      <Action label="Clear my import selection" secondary disabled={busy} onPress={() => { setSelected([]); setResults([]); }} />
    </Card>
    <Card><Title>Sync a completed day</Title><Copy>Import yesterday ({day}) in your profile zone ({context.zone}). Steps use the complete calendar-day aggregate, with no origin filter or overlapping raw totals. Weight uses recorded time; whole sleep sessions use their wake-up day.</Copy><Copy>Manual or richer activity days are preserved and reported as conflicts. Changed/deleted imports need manual review in Tracking; they are never silently recreated. Distance, active calories and exercise imports are not included in this initial reader.</Copy>
      <Action label="Sync yesterday now" loading={busy} disabled={busy || !runtime || !selected.length || !context.data || !!context.error} onPress={() => { if (selected.includes("steps")) setConfirmSteps(true); else syncNow(); }} />
      <ConfirmDialog visible={confirmSteps} title="Confirm this device's activity day" message={`Use ${day} (${context.zone}) as a complete activity snapshot for this account from your one authoritative device. If installation metadata is missing, a previously deleted day could be restored because the server has no activity deletion tombstone. Continue only if you have not intentionally deleted this day and no other device is syncing it. Manual or conflicting saved days will still be preserved.`} confirmLabel="I confirm this day and device" busy={busy} onCancel={() => setConfirmSteps(false)} onConfirm={() => { setConfirmSteps(false); syncNow(); }} />
      {results.map(result => <Card key={result.category}><MetricRow label={labels[result.category]} value={`${result.state.replaceAll("_", " ")} · ${result.saved} saved · ${result.skipped} replays`} /><Copy>{result.message}</Copy></Card>)}
    </Card><ErrorNote message={error} /><Action label="Continue manual tracking" secondary disabled={busy} onPress={() => router.replace("/(tabs)/tracking")} />
  </Page>;
}
