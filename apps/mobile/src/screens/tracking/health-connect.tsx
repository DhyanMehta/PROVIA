import { Action, Card, Copy, MetricRow, Page, Title } from "../../components/ui";
import { router } from "expo-router";
import { healthConnectReadiness } from "../../lib/health-connect/readiness";

export function HealthConnectScreen() {
  const readiness = healthConnectReadiness();
  return <Page><Title eyebrow="Android integration">Health Connect</Title>
    <Card><Title>Native setup is pending</Title><Copy>{readiness.reason}</Copy>
      <MetricRow label="Permissions" value="Not requested by this build" />
      <MetricRow label="Device availability" value="Not checked" />
      <MetricRow label="Synchronization" value="Disabled" />
      <MetricRow label="Last successful sync" value="Never synced by this build" />
      <Copy>Your device health records are not read or uploaded. Manual tracking remains available.</Copy>
    </Card>
    <Card><Title>Your choice, for each data type</Title><Copy>A verified future integration will ask for separate read access to steps, distance, active calories, weight and sleep. It must ask for your agreement before requesting device permissions. No background access is enabled here.</Copy><Copy>Permission loss or a failed read means unknown data, never a zero reading. Revoking permission stops future reads; it does not automatically delete records already saved to your PROVIA account.</Copy></Card>
    <Action label="Continue manual tracking" onPress={() => router.replace("/(tabs)/tracking")} />
  </Page>;
}
