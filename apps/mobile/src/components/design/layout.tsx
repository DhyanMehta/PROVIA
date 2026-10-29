import type { PropsWithChildren } from "react";
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { radius, spacing, useTheme } from "../../theme";
import { AppText, Copy } from "./text";

export function Page({ children, safeTop = false, scroll = true, refreshing = false, onRefresh, contentStyle }: PropsWithChildren<{
  safeTop?: boolean; scroll?: boolean; refreshing?: boolean; onRefresh?: () => void; contentStyle?: StyleProp<ViewStyle>;
}>) {
  const { colors } = useTheme();
  const content = { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.huge, maxWidth: 720, width: "100%" as const, alignSelf: "center" as const };
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={safeTop ? ["top", "left", "right", "bottom"] : ["left", "right", "bottom"]}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[content, contentStyle]}
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} /> : undefined}>
        {children}
      </ScrollView> : <View style={[content, { flex: 1 }, contentStyle]}>{children}</View>}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { colors } = useTheme();
  return <View style={[{ padding: spacing.xl, borderRadius: radius.card, borderCurve: "continuous", borderWidth: 1, gap: spacing.lg, backgroundColor: colors.card, borderColor: colors.line }, style]}>{children}</View>;
}
export function ChartContainer({ children, title, description }: PropsWithChildren<{ title: string; description?: string }>) {
  return <Card><AppText variant="heading" accessibilityRole="header">{title}</AppText>{description ? <Copy>{description}</Copy> : null}{children}</Card>;
}
