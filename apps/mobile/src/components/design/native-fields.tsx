import { Host, Picker } from "@expo/ui";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { useState } from "react";
import { Platform, View } from "react-native";
import { radius, spacing, useTheme } from "../../theme";
import { Action, Field } from "./controls";
import { AppText } from "./text";

export function SelectField<T extends string | number>({ label, value, options, onValueChange, disabled = false, hint, error, testID }: { label: string; value: T; options: readonly { label: string; value: T }[]; onValueChange: (value: T) => void; disabled?: boolean; hint?: string; error?: string; testID?: string }) {
  const { colors, darkMode } = useTheme();
  return <View style={{ gap: spacing.sm }}><AppText variant="label">{label}</AppText>
    <View accessible={false} accessibilityLabel={label} style={{ minHeight: 48, borderWidth: 1, borderColor: error ? colors.danger : colors.line, borderRadius: radius.control, backgroundColor: colors.card, padding: spacing.xs }}>
      <Host matchContents colorScheme={darkMode ? "dark" : "light"} seedColor={colors.accent}><Picker selectedValue={value} onValueChange={onValueChange} enabled={!disabled} appearance="menu" testID={testID ?? label}>
        {options.map(option => <Picker.Item key={option.value} label={option.label} value={option.value} />)}
      </Picker></Host>
    </View>{hint ? <AppText variant="caption" tone="muted">{hint}</AppText> : null}{error ? <AppText tone="danger" accessibilityRole="alert">{error}</AppText> : null}
  </View>;
}

export function parseOffsetDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const calendar = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() + 1 !== month || calendar.getUTCDate() !== day || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function OffsetDateField({ label, value, onChange, minimumDate, maximumDate, timeZoneName }: { label: string; value: Date; onChange: (value: Date) => void; minimumDate?: Date; maximumDate?: Date; timeZoneName: string }) {
  const [draft, setDraft] = useState(value.toISOString());
  const [error, setError] = useState<string>();
  return <Field label={label} value={draft} onChangeText={setDraft} autoCapitalize="none" autoCorrect={false} error={error}
    hint={`Profile zone: ${timeZoneName}. Enter a timestamp with its UTC offset, for example 2026-01-15T22:30:00+05:30. Z means UTC.`}
    onBlur={() => {
      const date = parseOffsetDate(draft);
      if (!date || (minimumDate && date < minimumDate) || (maximumDate && date > maximumDate)) {
        setError("Enter a valid timestamp with a UTC offset within the allowed range.");
      } else { setError(undefined); onChange(date); }
    }} />;
}

export function DateTimeField({ label, value, onChange, mode = "date", minimumDate, maximumDate, timeZoneName }: { label: string; value: Date; onChange: (value: Date) => void; mode?: "date" | "time"; minimumDate?: Date; maximumDate?: Date; timeZoneName?: string }) {
  const [open, setOpen] = useState(false);
  const { colors, darkMode } = useTheme();
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // SDK 58's Android picker exposes device-zone selection only. Never silently reinterpret it as a different profile zone.
  if (timeZoneName && deviceZone !== timeZoneName && Platform.OS !== "ios") {
    return <OffsetDateField key={`${label}-${value.toISOString()}`} label={label} value={value} onChange={onChange} minimumDate={minimumDate} maximumDate={maximumDate} timeZoneName={timeZoneName} />;
  }
  const display = value.toLocaleString(undefined, { timeZone: timeZoneName, ...(mode === "date" ? { year: "numeric", month: "short", day: "numeric" } : { hour: "2-digit", minute: "2-digit" }) });
  return <View style={{ gap: spacing.sm }}><AppText variant="label">{label}</AppText><Action label={display} onPress={() => setOpen(true)} secondary />
    <AppText variant="caption" tone="muted">Time zone: {timeZoneName ?? deviceZone}</AppText>
    {open ? <DateTimePicker value={value} mode={mode} minimumDate={minimumDate} maximumDate={maximumDate} timeZoneName={timeZoneName} accentColor={colors.accent} themeVariant={darkMode ? "dark" : "light"} presentation="dialog" is24Hour onDismiss={() => setOpen(false)} onValueChange={(_, date) => { setOpen(false); onChange(date); }} /> : null}
  </View>;
}
