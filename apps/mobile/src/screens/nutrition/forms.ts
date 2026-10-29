import type { Schema } from "../../lib/contracts";
import { decimalInput, offsetTimestamp } from "../../lib/form-values";
export type PortionDraft = { label: string; grams: string };
export type IngredientDraft = { food_id: string; name: string; quantity_g: string };
export const nutrientKeys = ["calories_kcal", "protein_g", "carbs_g", "fat_g", "fiber_g"] as const;
export function aliasesInput(text: string) {
  const values = [...new Set(text.split(",").map(value => value.trim()).filter(Boolean))];
  if (values.length > 30 || values.some(value => value.length > 100)) throw new Error("Use up to 30 aliases, each at most 100 characters.");
  return values;
}
export function portionsInput(portions: PortionDraft[]): Schema<"PortionCreate">[] {
  if (portions.length > 30) throw new Error("Use at most 30 measured portions.");
  const included = portions.filter(row => row.label.trim() || row.grams.trim());
  if (new Set(included.map(row => row.label.trim())).size !== included.length) throw new Error("Measured portion labels must be unique.");
  return included.map(row => {
    if (!row.label.trim() || row.label.trim().length > 100) throw new Error("Name each measured portion using 1–100 characters.");
    return { label: row.label.trim(), grams: decimalInput(row.grams, "portion grams", 0.001, 100000) };
  });
}
export function customFoodInput(name: string, brand: string, kind: Schema<"FoodCreate">["food_kind"], aliases: string, nutrients: Record<typeof nutrientKeys[number], string>, portions: PortionDraft[]): Schema<"FoodCreate"> {
  if (!name.trim() || name.trim().length > 300) throw new Error("Enter a food name of 1–300 characters.");
  if (brand.trim().length > 200) throw new Error("Use a brand of at most 200 characters.");
  const result: Schema<"FoodCreate"> = { name: name.trim(), brand: brand.trim() || null, food_kind: kind, aliases: aliasesInput(aliases), portions: portionsInput(portions) };
  for (const key of nutrientKeys) result[key] = nutrients[key].trim() ? decimalInput(nutrients[key], key === "calories_kcal" ? "energy" : key, 0, 1000000) : null;
  return result;
}
export function recipeInput(name: string, yieldGrams: string, ingredients: IngredientDraft[], aliases: string, portions: PortionDraft[]): Schema<"RecipeCreate"> {
  if (!name.trim() || name.trim().length > 300) throw new Error("Enter a recipe name of 1–300 characters.");
  if (!ingredients.length || ingredients.length > 100) throw new Error("Use 1–100 measured ingredients.");
  if (new Set(ingredients.map(row => row.food_id)).size !== ingredients.length) throw new Error("Combine repeated ingredients into a single measured quantity.");
  const yield_g = decimalInput(yieldGrams, "final cooked yield", 0.001, 100000), measured = portionsInput(portions);
  if (measured.some(row => Number(row.grams) > Number(yield_g))) throw new Error("A measured portion cannot exceed the final cooked yield.");
  return { name: name.trim(), yield_g, aliases: aliasesInput(aliases), portions: measured, ingredients: ingredients.map(row => ({ food_id: row.food_id, quantity_g: decimalInput(row.quantity_g, `${row.name} grams`, 0.001, 100000) })) };
}
export function mealPatch(original: Schema<"MealOut">, kind: Schema<"MealCreate">["meal_type"], timestamp: string, notes: string, ingredients: IngredientDraft[]): Schema<"MealPatch"> {
  if (!ingredients.length || ingredients.length > 100) throw new Error("A meal needs 1–100 foods.");
  const items = ingredients.map(row => ({ food_id: row.food_id, quantity_g: decimalInput(row.quantity_g, `${row.name} grams`, 0.001, 100000) }));
  const changed = items.length !== original.items.length || items.some((item, index) => item.food_id !== original.items[index].food_id || Number(item.quantity_g) !== Number(original.items[index].quantity_g));
  return { meal_type: kind, consumed_at: offsetTimestamp(timestamp), notes: notes.trim() || null, ...(changed ? { items } : {}) };
}
export function barcodeInput(text: string) {
  const value = text.trim();
  if (!/^[0-9]{8,14}$/.test(value)) throw new Error("Enter an 8–14 digit product barcode.");
  return value;
}
