import { Redirect, useLocalSearchParams } from "expo-router";

const destinations = {
  Nutrition: "/nutrition",
  Workouts: "/workouts",
  Tracking: "/tracking",
  Progress: "/progress",
} as const;

export default function NextSection() {
  const { section } = useLocalSearchParams<{ section?: string | string[] }>();
  const target =
    typeof section === "string" &&
    Object.prototype.hasOwnProperty.call(destinations, section)
      ? destinations[section as keyof typeof destinations]
      : "/";
  return <Redirect href={target} />;
}
