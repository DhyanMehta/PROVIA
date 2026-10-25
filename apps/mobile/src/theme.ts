import { useColorScheme } from "react-native";
const light = {
  background: "#F5F7F2",
  card: "#FFFFFF",
  text: "#15271D",
  muted: "#52645B",
  line: "#D7E1D9",
  accent: "#176F4B",
  pale: "#E1F2E7",
  danger: "#A12C2C",
};
const dark = {
  background: "#101B15",
  card: "#1B2B22",
  text: "#F0F6EF",
  muted: "#B1C7B9",
  line: "#385144",
  accent: "#8FDDB2",
  pale: "#213F30",
  danger: "#FFB4AB",
};
export function useTheme() {
  const darkMode = useColorScheme() === "dark";
  return { colors: darkMode ? dark : light, darkMode };
}
export const space = { small: 8, medium: 16, large: 24, page: 24 };
