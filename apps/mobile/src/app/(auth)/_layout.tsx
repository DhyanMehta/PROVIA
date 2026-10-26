import { Stack } from "expo-router/stack";
export default function AuthLayout() {
  return (
    <Stack>
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
