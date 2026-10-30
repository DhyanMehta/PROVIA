import { Stack } from "expo-router/stack";
import { useTheme } from "../../theme";
export default function OnboardingLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="onboarding" options={{ title: "Your plan" }} />
    </Stack>
  );
}
