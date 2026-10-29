import type { Schema } from "./contracts";
import { decimalInput, dateOnly, shiftDate } from "./form-values";

export const activityLevels = ["sedentary", "light", "moderate", "active", "very_active"] as const;
export const goalTypes = ["weight_loss", "muscle_gain", "maintenance", "general_fitness"] as const;
export const friendly = (value: string) => value.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase());
const decimal = (value: unknown) => typeof value === "string" && /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value) && Number.isFinite(Number(value));
export function profileData(value: Schema<"ProfileOut">): boolean {
  if (!(!!value && typeof value.id === "string" && typeof value.display_name === "string" &&
    decimal(value.height_cm) && decimal(value.current_weight_kg) && activityLevels.includes(value.activity_level) &&
    ["kg", "lb"].includes(value.preferred_weight_unit) && typeof value.timezone === "string" &&
    (value.date_of_birth == null || typeof value.date_of_birth === "string"))) return false;
  try { validTimezone(value.timezone); birthDate(value.date_of_birth ?? "", value.timezone); return true; } catch { return false; }
}
export function goalData(value: Schema<"GoalOut">): boolean {
  return !!value && typeof value.id === "string" && goalTypes.includes(value.goal_type) &&
    ["active", "paused", "completed"].includes(value.status) &&
    typeof value.created_at === "string" && Number.isFinite(Date.parse(value.created_at)) &&
    (value.daily_steps_target === null || (Number.isInteger(value.daily_steps_target) && Number(value.daily_steps_target) >= 0)) &&
    (value.calculation_method === null || typeof value.calculation_method === "string") &&
    [value.target_weight_kg, value.current_weight_kg_snapshot, value.daily_calorie_target, value.selected_deficit_kcal].every(item => item === null || decimal(item));
}
export function calculationData(value: Schema<"GoalCalculationOut">): boolean {
  return !!value && [value.maintenance_calories, value.daily_calorie_target, value.protein_target_g, value.carbs_target_g, value.fat_target_g, value.fiber_target_g].every(decimal);
}
export function validTimezone(value: string): string {
  const zone = value.trim();
  if (!zone || zone.length > 64) throw new Error("Enter an IANA time zone, such as Asia/Kolkata.");
  try { dateOnly(zone); } catch { throw new Error("Enter a valid IANA time zone, such as Asia/Kolkata."); }
  return zone;
}
export function birthDate(value: string, zone: string): string | null {
  if (!value.trim()) return null;
  const date = value.trim();
  shiftDate(date, 0);
  if (date < "1900-01-01" || date > dateOnly(zone)) throw new Error("Date of birth must be between 1900 and today.");
  return date;
}
export function profileInput(value: Schema<"ProfilePut">): Schema<"ProfilePut"> {
  if (!value.display_name.trim() || value.display_name.trim().length > 100) throw new Error("Enter a name of 1–100 characters.");
  const timezone = validTimezone(value.timezone);
  return { ...value, display_name: value.display_name.trim(), height_cm: decimalInput(String(value.height_cm), "height", 0.01, 300, 2), current_weight_kg: decimalInput(String(value.current_weight_kg), "weight", 0.001, 1000), timezone, date_of_birth: birthDate(value.date_of_birth ?? "", timezone) };
}
