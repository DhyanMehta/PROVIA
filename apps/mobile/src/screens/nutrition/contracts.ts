import { offsetTimestamp, shiftDate } from "../../lib/form-values";
type Check = (value: unknown) => boolean;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text: Check = v => typeof v === "string";
const id: Check = v => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const decimal: Check = v => typeof v === "string" && /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(v) && Number.isFinite(Number(v));
const nullable = (check: Check): Check => v => v === null || check(v);
const optional = (check: Check): Check => v => v === undefined || check(v);
const array = (check: Check): Check => v => Array.isArray(v) && v.every(check);
const shape = (checks: Record<string, Check>): Check => v => obj(v) && Object.entries(checks).every(([key, check]) => check(v[key]));
const timestamp: Check = v => { try { return typeof v === "string" && !!offsetTimestamp(v); } catch { return false; } };
const day: Check = v => { try { return typeof v === "string" && shiftDate(v, 0) === v; } catch { return false; } };
const count: Check = v => typeof v === "number" && Number.isInteger(v) && v >= 0;
const nutrients = Object.fromEntries(["calories_kcal", "protein_g", "carbs_g", "fat_g", "fiber_g"].map(k => [k, nullable(decimal)]));
const snapshots = Object.fromEntries(Object.keys(nutrients).map(k => [k + "_snapshot", nullable(decimal)]));
export const totalsCheck = shape(nutrients);
export const foodCheck = shape({ id, name: text, brand: nullable(text), source: text, source_food_id: nullable(text), serving_basis: v => v === "100g", food_kind: text,
  aliases: optional(array(text)), source_url: optional(nullable(text)), license_name: optional(nullable(text)), verified_at: optional(nullable(timestamp)),
  portions: array(shape({ id, label: text, grams: decimal })), ...nutrients });
export const quantityCheck = shape({ food_id: id, quantity_g: decimal, ...nutrients });
export const mealCheck = shape({ id, meal_type: v => ["breakfast", "lunch", "dinner", "snack"].includes(String(v)), consumed_at: timestamp, notes: nullable(text),
  items: array(shape({ id, food_id: id, quantity_g: decimal, ...snapshots })), totals: totalsCheck });
export const mealPageCheck = shape({ items: array(mealCheck), limit: count, offset: count });
export const searchCheck = shape({ items: array(foodCheck), page: count, page_size: count, provider_status: v => obj(v) && Object.values(v).every(text) });
export const recipeCheck = shape({ id, food: foodCheck, yield_g: decimal, incomplete: v => typeof v === "boolean", created_at: timestamp,
  ingredients: array(shape({ food_id: id, quantity_g: decimal, ...snapshots })) });
export const recipePageCheck = shape({ items: array(recipeCheck), limit: count, offset: count });
const gramBudget = shape({ consumed_g: nullable(decimal), target_g: nullable(decimal), remaining_g: nullable(decimal) });
export const nutritionCheck = shape({ date: day, timezone: text, meals: array(mealCheck), calories: shape({ consumed: nullable(decimal), target: nullable(decimal), remaining: nullable(decimal) }),
  protein: gramBudget, carbs: gramBudget, fat: gramBudget, fiber: gramBudget });
