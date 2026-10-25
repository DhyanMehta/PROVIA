import { useLocalSearchParams } from "expo-router";
import { Card, Copy, Page, Title } from "../../components/ui";
export default function NextSection() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const title = ["Nutrition", "Workouts", "Tracking", "Progress"].includes(
    section,
  )
    ? section
    : "More tools";
  return (
    <Page>
      <Title eyebrow="Next sprint phase">{title}</Title>
      <Card>
        <Copy>
          This screen is not implemented yet. Your dashboard shows real saved
          backend data; editing and detailed history for this area are planned
          for the next execution.
        </Copy>
      </Card>
    </Page>
  );
}
