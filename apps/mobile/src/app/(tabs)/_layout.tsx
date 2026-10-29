import { Tabs } from "expo-router";
import { useTheme } from "../../theme";
import { AppIcon, type IconName } from "../../components/ui";
const icons: Record<string, IconName> = { dashboard: "dashboard", nutrition: "nutrition", workouts: "workout", tracking: "tracking", progress: "progress", profile: "profile" };
export default function FitnessTabs() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color }) => <AppIcon name={icons[route.name]} color={typeof color === "string" ? color : undefined} size={22} />,
        tabBarLabelStyle: { fontSize: 10, fontFamily: "Inter_500Medium" },
        tabBarActiveTintColor: colors.accent,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        tabBarStyle: { backgroundColor: colors.background },
      })}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Today" }} />
      <Tabs.Screen name="nutrition" options={{ title: "Nutrition" }} />
      <Tabs.Screen name="workouts" options={{ title: "Workouts" }} />
      <Tabs.Screen name="tracking" options={{ title: "Tracking" }} />
      <Tabs.Screen name="progress" options={{ title: "Progress" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
