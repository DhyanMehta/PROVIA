import { Button as NativeButton, Host } from "@expo/ui";
import { useState } from "react";
import { ActivityIndicator, TextInput, View } from "react-native";
import type { TextInputProps } from "react-native";
import { fonts, radius, spacing, typography, useTheme } from "../../theme";
import { AppText } from "./text";
import { ErrorNote } from "./states";
import { IconButton } from "./icon";

export function Action({ label, onPress, disabled = false, secondary = false, loading = false, variant, testID }: {
  label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; loading?: boolean;
  variant?: "primary" | "secondary" | "danger" | "quiet"; testID?: string;
}) {
  const { colors, darkMode } = useTheme();
  const type = variant ?? (secondary ? "secondary" : "primary");
  return <View style={{ gap: spacing.xs }}>
    {loading ? <ActivityIndicator color={colors.accent} accessibilityLabel="Saving" /> : null}
    <Host matchContents colorScheme={darkMode ? "dark" : "light"} seedColor={type === "danger" ? colors.danger : colors.accent} style={{ minHeight: 48 }}>
      <NativeButton label={loading ? label + "…" : label} onPress={onPress} disabled={disabled || loading}
        variant={type === "quiet" ? "text" : type === "secondary" ? "outlined" : "filled"}
        testID={testID} style={{ width: "100%", paddingVertical: 12 }} />
    </Host>
  </View>;
}
export function Field({ label, error, hint, style, ...props }: TextInputProps & { label: string; error?: string; hint?: string }) {
  const { colors } = useTheme();
  return <View style={{ gap: spacing.sm }}>
    <AppText variant="label">{label}</AppText>
    <TextInput {...props} accessibilityLabel={label} placeholderTextColor={colors.muted}
      style={[typography.body, { minHeight: 48, borderWidth: 1, borderRadius: radius.control, borderCurve: "continuous", paddingHorizontal: spacing.md, paddingVertical: spacing.md,
        color: colors.text, backgroundColor: colors.card, borderColor: error ? colors.danger : colors.line }, style]} />
    {hint ? <AppText variant="caption" tone="muted">{hint}</AppText> : null}
    {error ? <ErrorNote message={error} /> : null}
  </View>;
}
export function PasswordField(props: TextInputProps & { label: string; error?: string; hint?: string }) {
  const [visible, setVisible] = useState(false);
  return <View style={{ gap: spacing.xs }}><Field {...props} autoCapitalize="none" autoCorrect={false} secureTextEntry={!visible} />
    <IconButton name={visible ? "eye-off" : "eye"} label={visible ? "Hide " + props.label.toLowerCase() : "Show " + props.label.toLowerCase()} onPress={() => setVisible(!visible)} />
  </View>;
}
export function NumberField(props: TextInputProps & { label: string; error?: string; hint?: string }) {
  return <Field {...props} inputMode="decimal" keyboardType="decimal-pad" style={[{ fontFamily: fonts.medium }, props.style]} />;
}
