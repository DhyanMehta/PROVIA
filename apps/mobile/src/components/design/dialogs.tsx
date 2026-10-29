import { BottomSheet, Host } from "@expo/ui";
import { View } from "react-native";
import { spacing, useTheme } from "../../theme";
import { Action } from "./controls";
import { AppText, Copy } from "./text";

export function ConfirmDialog({ visible, title, message, onConfirm, onCancel, busy = false, confirmLabel = "Confirm", destructive = false }: { visible: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void; busy?: boolean; confirmLabel?: string; destructive?: boolean }) {
  const { colors } = useTheme();
  return <Host matchContents><BottomSheet isPresented={visible} onDismiss={() => { if (!busy) onCancel(); }} containerColor={colors.card}>
    <View accessibilityViewIsModal style={{ padding: spacing.xxl, gap: spacing.lg }}><AppText variant="heading" accessibilityRole="header">{title}</AppText><Copy>{message}</Copy>
      <Action label={confirmLabel} onPress={onConfirm} loading={busy} variant={destructive ? "danger" : "primary"} /><Action label="Cancel" onPress={onCancel} secondary disabled={busy} />
    </View>
  </BottomSheet></Host>;
}
