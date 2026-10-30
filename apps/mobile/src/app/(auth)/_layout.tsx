import { Stack } from "expo-router/stack";
import { useTheme } from "../../theme";
export default function AuthLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ title: "Sign in" }} />
      <Stack.Screen name="register" options={{ title: "Create account" }} />
      <Stack.Screen name="verify-email" options={{ title: "Verify email" }} />
      <Stack.Screen
        name="forgot-password"
        options={{ title: "Account recovery" }}
      />
      <Stack.Screen
        name="reset-password"
        options={{ title: "Reset password" }}
      />
    </Stack>
  );
}
