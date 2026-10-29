import { View } from "react-native";
import { spacing, useTheme } from "../../theme";
import { AppText, MetricRow } from "./text";

export function ProgressBar({ value, label }: { value: number | null; label: string }) {
  const { colors } = useTheme();
  const known = value !== null && Number.isFinite(value);
  const percentage = known ? Math.max(0, Math.min(100, value * 100)) : 0;
  return <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={known ? { min: 0, max: 100, now: percentage } : { text: "Not recorded" }} style={{ height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: "hidden" }}>
    <View style={{ width: `${percentage}%`, height: "100%", backgroundColor: colors.accent }} />
  </View>;
}
export function MacroProgress({ label, consumed, target, remaining, unit = "g" }: { label: string; consumed: number | null; target: number | null; remaining?: number | null; unit?: string }) {
  const recorded = consumed !== null && Number.isFinite(consumed);
  const hasTarget = target !== null && Number.isFinite(target) && target > 0;
  const rest = remaining === undefined ? recorded && hasTarget ? target - consumed : null : remaining;
  return <View style={{ gap: spacing.sm }}>
    <MetricRow label={label} value={recorded ? `${consumed.toLocaleString()} ${unit}` : "Not recorded"} detail={hasTarget ? `Target ${target.toLocaleString()} ${unit}` : "Target unavailable"} />
    <ProgressBar label={label} value={recorded && hasTarget ? consumed / target : null} />
    {rest !== null && Number.isFinite(rest) ? <AppText variant="caption" tone={rest < 0 ? "warning" : "muted"}>{rest.toLocaleString()} {unit} remaining</AppText> : null}
  </View>;
}
