import { Button as NativeButton, Host } from "@expo/ui";
import type { PropsWithChildren } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { TextInputProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../theme";

export function Page({ children, safeTop = false }: PropsWithChildren<{ safeTop?: boolean }>) {
  const { colors } = useTheme();
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={safeTop ? ["top", "left", "right", "bottom"] : ["left", "right", "bottom"]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.page}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Title({
  children,
  eyebrow,
}: PropsWithChildren<{ eyebrow?: string }>) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {eyebrow && (
        <Text
          style={{
            color: colors.accent,
            fontSize: 13,
            letterSpacing: 2,
            fontWeight: "700",
          }}
        >
          {eyebrow.toUpperCase()}
        </Text>
      )}
      <Text
        accessibilityRole="header"
        style={{
          color: colors.text,
          fontSize: 34,
          lineHeight: 40,
          fontWeight: "700",
        }}
      >
        {children}
      </Text>
    </View>
  );
}
export function Copy({ children }: PropsWithChildren) {
  const { colors } = useTheme();
  return (
    <Text style={{ color: colors.muted, fontSize: 16, lineHeight: 24 }}>
      {children}
    </Text>
  );
}
export function Card({ children }: PropsWithChildren) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.line },
      ]}
    >
      {children}
    </View>
  );
}
export function Action({
  label,
  onPress,
  disabled = false,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  const { colors, darkMode } = useTheme();
  return (
    <Host
      matchContents
      colorScheme={darkMode ? "dark" : "light"}
      seedColor={colors.accent}
      style={{ minHeight: 52 }}
    >
      <NativeButton
        label={label}
        onPress={onPress}
        disabled={disabled}
        variant={secondary ? "outlined" : "filled"}
        style={{ width: "100%", height: 52 }}
      />
    </Host>
  );
}
export function Field({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 7 }}>
      <Text style={{ color: colors.text, fontWeight: "600", fontSize: 15 }}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.card,
            borderColor: colors.line,
          },
        ]}
        {...props}
      />
      {error && <ErrorNote message={error} />}
    </View>
  );
}
export function ErrorNote({ message }: { message: string }) {
  const { colors } = useTheme();
  return (
    <Text
      accessibilityRole="alert"
      selectable
      style={{ color: colors.danger, lineHeight: 23 }}
    >
      {message}
    </Text>
  );
}
export function Busy({ label = "Loading your data…" }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 16, paddingVertical: 24 }}>
      <ActivityIndicator color={colors.accent} />
      <Copy>{label}</Copy>
    </View>
  );
}
export function Value({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: colors.muted, fontSize: 14 }}>{label}</Text>
      <Text
        selectable
        style={{
          color: colors.text,
          fontSize: 25,
          fontWeight: "700",
          fontVariant: ["tabular-nums"],
        }}
      >
        {value}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  page: {
    padding: 24,
    gap: 20,
    paddingBottom: 44,
    maxWidth: 680,
    width: "100%",
    alignSelf: "center",
  },
  card: { padding: 20, borderRadius: 20, borderWidth: 1, gap: 16 },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 18,
  },
});
