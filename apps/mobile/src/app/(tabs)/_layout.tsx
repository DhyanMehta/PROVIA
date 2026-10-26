import { Tabs } from "expo-router";
import { useTheme } from "../../theme";
export default function FitnessTabs() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        tabBarStyle: { backgroundColor: colors.background },
      }}
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
