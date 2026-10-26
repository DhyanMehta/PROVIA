import { router } from "expo-router";
import { Action, Copy, Page, Title } from "../components/ui";
export default function NotFound() {
  return (
    <Page safeTop>
      <Title>Let’s get you home.</Title>
      <Copy>This page is unavailable.</Copy>
      <Action label="Return to PROVIA" onPress={() => router.replace("/")} />
    </Page>
  );
}
