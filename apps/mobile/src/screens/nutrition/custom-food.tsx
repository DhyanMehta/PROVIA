import { useState } from "react";
import { router } from "expo-router";
import { Action, Copy, Field, NumberField, Page, SelectField, Title } from "../../components/ui";
import { useApi } from "../../providers/api";
import { useMutation } from "../../hooks/use-mutation";
import type { Schema } from "../../lib/contracts";
import { Back, FormError, MutationNote, nutrientLabels, useDraftGuard } from "./common";
import { customFoodInput, nutrientKeys, type PortionDraft } from "./forms";
import { foodCheck } from "./contracts";
import { PortionEditor } from "./portion-editor";
export default function CustomFoodScreen() {
  const api = useApi(), mutation = useMutation();
  const [name, setName] = useState(""), [brand, setBrand] = useState(""), [aliases, setAliases] = useState("");
  const [kind, setKind] = useState<Schema<"FoodCreate">["food_kind"]>("unspecified");
  const [nutrients, setNutrients] = useState({ calories_kcal: "", protein_g: "", carbs_g: "", fat_g: "", fiber_g: "" });
  const [portions, setPortions] = useState<PortionDraft[]>([]), [failure, setFailure] = useState<unknown>();
  const locked = mutation.pending || mutation.uncertain;
  const guard = useDraftGuard(!!(name || brand || aliases || portions.length || Object.values(nutrients).some(Boolean)), mutation.uncertain, mutation.pending);
  const saved = (value: unknown) => { guard.allow(); router.replace({ pathname: "/nutrition/food/[food_id]", params: { food_id: (value as Schema<"FoodOut">).id } }); };
  async function save() { try { const body = customFoodInput(name, brand, kind, aliases, nutrients, portions); setFailure(undefined); const value = await mutation.run(key => api.request("post", "/api/v1/foods/custom", { body, idempotencyKey: key, validate: foodCheck }), { idempotent: true }); if (value) saved(value); } catch (error) { setFailure(error); } }
  return <Page><Back /><Title>Create a custom food</Title><Copy>Use measured or package-label nutrition per 100 g. Leave unknown values blank; enter zero only when it is known. Your food is private and is not a verified catalog entry.</Copy><Field label="Food name" value={name} onChangeText={setName} editable={!locked} maxLength={300} /><Field label="Brand (optional)" value={brand} onChangeText={setBrand} editable={!locked} maxLength={200} /><SelectField label="Food kind" value={kind} options={[{ value: "unspecified", label: "Unspecified" }, { value: "ingredient", label: "Ingredient" }, { value: "prepared_dish", label: "Prepared dish" }]} onValueChange={setKind} disabled={locked} /><Field label="Aliases (comma separated)" hint="Add names for this same preparation in English, Hinglish, Hindi or Gujarati, such as its regional name. Do not alias dishes with different ingredients or cooking methods." value={aliases} onChangeText={setAliases} editable={!locked} />{nutrientKeys.map(key => <NumberField key={key} label={`${nutrientLabels[key]} per 100 g (${key === "calories_kcal" ? "kcal" : "g"})`} value={nutrients[key]} onChangeText={value => setNutrients(previous => ({ ...previous, [key]: value }))} editable={!locked} />)}<Copy>Only add portions whose gram weight you measured. No density or household-unit conversion is assumed.</Copy><PortionEditor value={portions} onChange={setPortions} disabled={locked} />{guard.dialog}<FormError error={failure} /><MutationNote mutation={mutation} retryable onSuccess={saved} /><Action label="Save custom food" loading={mutation.pending} disabled={locked} onPress={() => { void save(); }} /></Page>;
}
