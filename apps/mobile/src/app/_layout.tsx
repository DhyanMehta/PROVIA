import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../providers/auth";
import { ApiProvider } from "../providers/api";
import { validatePublicConfig } from "../lib/config";
import { Copy, Page, Title } from "../components/ui";
import { SessionGate } from "../components/session-gate";
import { useTheme } from "../theme";

function Navigation({ apiUrl }: { apiUrl: string }) {
  const { isLoaded, isSignedIn, userId, user } = useAuth();
  const { colors } = useTheme();
  return (
    <SessionGate loaded={isLoaded}>
      <ApiProvider key={userId ?? "signed-out"} baseUrl={apiUrl}>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" options={{ title: "PROVIA" }} />
          <Stack.Protected guard={isSignedIn}>
            <Stack.Screen
              name="account"
              options={{ title: "Account & sessions" }}
            />
          </Stack.Protected>
          <Stack.Protected guard={isSignedIn && !!user?.email_verified}>
            <Stack.Screen
              name="(onboarding)"
              options={{ headerShown: false }}
            />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="food-search"
              options={{ title: "Food search" }}
            />
            <Stack.Screen
              name="next/[section]"
              options={{ title: "Feature details" }}
            />
          </Stack.Protected>
        </Stack>
      </ApiProvider>
    </SessionGate>
  );
}
export default function Layout() {
  let config;
  try {
    config = validatePublicConfig(process.env.EXPO_PUBLIC_API_URL, __DEV__);
  } catch (error) {
    return (
      <SafeAreaProvider>
        <Page safeTop>
          <Title eyebrow="PROVIA setup">Connect your app</Title>
          <Copy>
            {error instanceof Error
              ? error.message
              : "Public configuration is missing."}
          </Copy>
        </Page>
      </SafeAreaProvider>
    );
  }
  return (
    <SafeAreaProvider>
      <AuthProvider baseUrl={config.apiUrl}>
        <Navigation apiUrl={config.apiUrl} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
