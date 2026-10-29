import { Stack } from "expo-router/stack";
import { useTheme } from "../../theme";
export default function TrackingStack() { const { colors } = useTheme(); return <Stack screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text, headerBackButtonDisplayMode: "minimal", contentStyle: { backgroundColor: colors.background } }} />; }
