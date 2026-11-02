import { ActivityIndicator, Modal, Pressable, ScrollView, View } from "react-native";
import { radius, spacing, useTheme } from "../../theme";
import { AppText, Copy } from "./text";

export function ConfirmDialog({ visible, title, message, onConfirm, onCancel, busy = false, confirmLabel = "Confirm", destructive = false }: { visible: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void; busy?: boolean; confirmLabel?: string; destructive?: boolean }) {
  const { colors } = useTheme();
  if (!visible) return null;

  const cancel = () => { if (!busy) onCancel(); };
  // Keep this entire dialog in RN to avoid the Compose Host touch dispatch
  // implicated in the Android sheet crash. Action would reintroduce a Host.
  return <Modal testID="confirmation-dialog" visible transparent animationType="none" onRequestClose={cancel}>
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.xxl, backgroundColor: colors.overlay }}>
      <Pressable testID="confirmation-backdrop" accessible={false} disabled={busy} onPress={cancel}
        style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }} />
      <View accessibilityViewIsModal style={{ width: "100%", maxWidth: 560, maxHeight: "100%", backgroundColor: colors.card, borderRadius: radius.sheet, borderCurve: "continuous", overflow: "hidden" }}>
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ padding: spacing.xxl, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
          <AppText variant="heading" accessibilityRole="header">{title}</AppText><Copy>{message}</Copy>
          <Pressable accessibilityRole="button" accessibilityLabel={busy ? confirmLabel + "…" : confirmLabel} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onConfirm}
            style={({ pressed }) => ({ minHeight: 48, borderRadius: radius.control, padding: spacing.md, alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: destructive ? colors.danger : colors.accent, opacity: busy || pressed ? 0.7 : 1 })}>
            {busy ? <ActivityIndicator color={colors.onAccent} accessibilityLabel="Saving" /> : null}
            <AppText variant="label" style={{ color: colors.onAccent, textAlign: "center" }}>{busy ? confirmLabel + "…" : confirmLabel}</AppText>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={cancel}
            style={({ pressed }) => ({ minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: radius.control, padding: spacing.md, justifyContent: "center", opacity: busy || pressed ? 0.7 : 1 })}>
            <AppText variant="label" style={{ textAlign: "center" }}>Cancel</AppText>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
