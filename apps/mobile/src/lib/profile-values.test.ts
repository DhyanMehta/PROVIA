import { birthDate, calculationData, goalData, profileData, profileInput, validTimezone } from "./profile-values";
import type { Schema } from "./contracts";
const profile: Schema<"ProfilePut"> = { display_name: " Test ", height_cm: "175.12", current_weight_kg: "97.125", date_of_birth: "1995-02-28", preferred_weight_unit: "lb", activity_level: "active", timezone: "Asia/Kolkata" };

test("persisted zero-deficit maintenance accepts PostgreSQL finite exponent strings", () => {
  const maintenance = { id: "goal", goal_type: "maintenance", status: "paused", created_at: "2026-10-29T08:00:00Z", daily_steps_target: null, calculation_method: "provia", target_weight_kg: "97.000", current_weight_kg_snapshot: "97.000", daily_calorie_target: "2328.00000000", selected_deficit_kcal: "0E-8" } as Schema<"GoalOut">;
  expect(goalData(maintenance)).toBe(true);
  expect(goalData({ ...maintenance, selected_deficit_kcal: "1E999" })).toBe(false);
  expect(goalData({ ...maintenance, selected_deficit_kcal: "NaN" })).toBe(false);
});
test("complete profile replacement preserves optional date and preferences", () => {
  expect(profileInput(profile)).toEqual({ ...profile, display_name: "Test" });
});
test.each(["1899-12-31", "2025-02-30", "9999-01-01", "2020-13-01"])("invalid birth date %s is rejected", value => {
  expect(() => birthDate(value, "Asia/Kolkata")).toThrow();
});
test("blank DOB is an explicit supported null", () => expect(birthDate("", "UTC")).toBeNull());
test("invalid profile zone fails before replacement", () => expect(() => validTimezone("Not/AZone")).toThrow());
test("partial or object-valued profile responses are rejected", () => {
  expect(profileData({ ...profile, id: "id", display_name: { unsafe: true } } as unknown as Schema<"ProfileOut">)).toBe(false);
  expect(profileData({ ...profile, id: "id", height_cm: "NaN" } as Schema<"ProfileOut">)).toBe(false);
});
test("calculation preview requires every displayed macro and maintenance", () => {
  const preview = { maintenance_calories: "2328", daily_calorie_target: "1828", protein_target_g: "161.5", carbs_target_g: "142.725", fat_target_g: "67.9", fiber_target_g: "25.592" } as Schema<"GoalCalculationOut">;
  expect(calculationData(preview)).toBe(true);
  expect(calculationData({ ...preview, fiber_target_g: undefined } as unknown as Schema<"GoalCalculationOut">)).toBe(false);
});
