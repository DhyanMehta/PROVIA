import type { PropsWithChildren } from "react";
import { Text, View } from "react-native";
import type { TextProps } from "react-native";
import { spacing, typography, useTheme } from "../../theme";
import type { TextVariant } from "../../theme";

export function AppText({ variant = "body", tone = "text", style, ...props }: TextProps & {
  variant?: TextVariant; tone?: "text" | "muted" | "accent" | "danger" | "warning";
}) {
  const { colors } = useTheme();
  return <Text {...props} style={[typography[variant], { color: colors[tone] }, style]} />;
}
export function Title({ children, eyebrow }: PropsWithChildren<{ eyebrow?: string }>) {
  return <View style={{ gap: spacing.sm }}>
    {eyebrow ? <AppText variant="label" tone="accent">{eyebrow}</AppText> : null}
    <AppText variant="title" accessibilityRole="header">{children}</AppText>
  </View>;
}
export function Copy({ children }: PropsWithChildren) { return <AppText tone="muted">{children}</AppText>; }
export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <View style={{ gap: spacing.xs }}>
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm }}>
      <AppText variant="heading" accessibilityRole="header" style={{ flexGrow: 1 }}>{title}</AppText>{action}
    </View>
    {description ? <Copy>{description}</Copy> : null}
  </View>;
}
export function Value({ label, value }: { label: string; value: string }) {
  return <View style={{ gap: spacing.xs, flexShrink: 1 }}>
    <AppText variant="caption" tone="muted">{label}</AppText>
    <AppText variant="number" selectable>{value}</AppText>
  </View>;
}
export function MetricRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <View style={{ gap: spacing.xs }}>
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: spacing.sm }}>
      <AppText tone="muted" style={{ flexGrow: 1 }}>{label}</AppText>
      <AppText variant="label" selectable>{value}</AppText>
    </View>
    {detail ? <AppText variant="caption" tone="muted">{detail}</AppText> : null}
  </View>;
}
