import { Stack } from "expo-router/stack";
export default function OnboardingLayout() {
  return (
    <Stack>
      <Stack.Screen name="onboarding" options={{ title: "Your plan" }} />
    </Stack>
  );
}
