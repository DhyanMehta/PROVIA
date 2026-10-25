import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ApiProvider } from "../providers/api";
import { validatePublicConfig } from "../lib/config";
import { Copy, Page, Title } from "../components/ui";
import { SessionGate } from "../components/session-gate";
import { useTheme } from "../theme";

function Navigation({ apiUrl }: { apiUrl: string }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
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
          <Stack.Screen
            name="index"
            options={{ title: "PROVIA", headerShown: false }}
          />
          <Stack.Protected guard={!isSignedIn}>
            <Stack.Screen name="welcome" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={!!isSignedIn}>
            <Stack.Screen name="onboarding" options={{ title: "Your plan" }} />
            <Stack.Screen
              name="dashboard"
              options={{ title: "PROVIA", headerBackVisible: false }}
            />
            <Stack.Screen name="profile" options={{ title: "Your profile" }} />
            <Stack.Screen
              name="next/[section]"
              options={{ title: "Coming next" }}
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
    config = validatePublicConfig(
      process.env.EXPO_PUBLIC_API_URL,
      process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
      __DEV__,
    );
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
          <Copy>
            Account setup instructions are in docs/sprint48-deployment.md.
            Restart Metro after changing public configuration.
          </Copy>
        </Page>
      </SafeAreaProvider>
    );
  }
  return (
    <SafeAreaProvider>
      <ClerkProvider publishableKey={config.clerkKey} tokenCache={tokenCache}>
        <Navigation apiUrl={config.apiUrl} />
      </ClerkProvider>
    </SafeAreaProvider>
  );
}
