import { Button, Host } from "@expo/ui";
import { ActivityIndicator, View } from "react-native";
import { radius, spacing, useTheme } from "../../theme";
import { AppIcon } from "./icon";
import { AppText, Copy } from "./text";

export function ErrorNote({ message }: { message?: string | null }) {
  return message ? <AppText tone="danger" accessibilityRole="alert" selectable>{message}</AppText> : null;
}
export function Busy({ label = "Loading" }: { label?: string }) {
  const { colors } = useTheme();
  return <View accessibilityLiveRegion="polite" style={{ gap: spacing.md, alignItems: "center", padding: spacing.xxl }}><ActivityIndicator color={colors.accent} /><AppText tone="muted">{label}</AppText></View>;
}
export function EmptyState({ title, message }: { title: string; message: string }) {
  return <View style={{ gap: spacing.sm, paddingVertical: spacing.xxl }}><AppText variant="heading">{title}</AppText><Copy>{message}</Copy></View>;
}
export function ErrorState({ title = "Could not load this", message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  const { colors, darkMode } = useTheme();
  return <View style={{ gap: spacing.md, paddingVertical: spacing.lg }} accessibilityLiveRegion="polite"><AppIcon name="warning" color={colors.danger} /><AppText variant="heading">{title}</AppText><ErrorNote message={message} />
    {onRetry ? <Host matchContents colorScheme={darkMode ? "dark" : "light"} seedColor={colors.accent} style={{ minHeight: 48 }}><Button label="Try again" onPress={onRetry} variant="outlined" style={{ paddingVertical: 12 }} /></Host> : null}
  </View>;
}
export function LoadingSkeleton({ lines = 3 }: { lines?: number }) {
  const { colors } = useTheme();
  return <View accessible accessibilityLabel="Loading content" accessibilityState={{ busy: true }} style={{ gap: spacing.md }}>
    {Array.from({ length: Math.max(1, Math.min(8, lines)) }, (_, index) => <View key={index} style={{ height: index === 0 ? 32 : 16, width: index === 0 ? "55%" : "100%", backgroundColor: colors.skeleton, borderRadius: radius.small }} />)}
  </View>;
}
