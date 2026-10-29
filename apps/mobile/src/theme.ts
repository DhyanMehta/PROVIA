import { useColorScheme } from "react-native";
import type { TextStyle } from "react-native";

// Fixed brand neutrals keep wallpaper changes from altering health-data contrast.
export const palettes = {
  light: {
    background: "#F5F5F0", card: "#FFFFFF", text: "#1C2923", muted: "#58675E",
    line: "#D7DED7", accent: "#176B49", pale: "#E7F0E8", danger: "#A02D2D",
    onAccent: "#FFFFFF", warning: "#835817", warningSurface: "#FFF3DA",
    disabled: "#78857D", skeleton: "#E1E7E0", overlay: "rgba(9,22,15,0.48)",
  },
  dark: {
    background: "#111C16", card: "#1B2A21", text: "#F1F5ED", muted: "#B5C5B9",
    line: "#3A5142", accent: "#9BDAB2", pale: "#243F2D", danger: "#FFB4AB",
    onAccent: "#102719", warning: "#F3CE84", warningSurface: "#3F331E",
    disabled: "#94A799", skeleton: "#2D4233", overlay: "rgba(0,0,0,0.6)",
  },
} as const;
export type ThemeColors = { [K in keyof typeof palettes.light]: string };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 40 } as const;
export const space = { small: spacing.sm, medium: spacing.lg, large: spacing.xxl, page: spacing.xl };
export const radius = { small: 8, control: 12, card: 16, sheet: 24 } as const;
export const fonts = {
  regular: "Inter_400Regular", medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold", bold: "Inter_700Bold",
} as const;
export const typography = {
  display: { fontFamily: fonts.semibold, fontSize: 38, lineHeight: 46, fontVariant: ["tabular-nums"] },
  title: { fontFamily: fonts.semibold, fontSize: 28, lineHeight: 36 },
  heading: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 23 },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  number: { fontFamily: fonts.semibold, fontSize: 24, lineHeight: 32, fontVariant: ["tabular-nums"] },
} as const satisfies Record<string, TextStyle>;
export type TextVariant = keyof typeof typography;

export function useTheme() {
  const darkMode = useColorScheme() === "dark";
  return { colors: palettes[darkMode ? "dark" : "light"] as ThemeColors, darkMode, spacing, radius };
}
