import { useRef, useState, type PropsWithChildren } from "react";
import { router, useLocalSearchParams, usePreventRemove } from "expo-router";
import { Action, AppText, Card, ConfirmDialog, ErrorNote, MetricRow } from "../../components/ui";
import { ApiError, errorMessage } from "../../lib/api-client";
import type { Schema } from "../../lib/contracts";
import { metric } from "../../lib/format";
import { useMutation } from "../../hooks/use-mutation";

export const mealKinds = ["breakfast", "lunch", "dinner", "snack"] as const;
export const mealOptions = mealKinds.map(value => ({ label: value[0].toUpperCase() + value.slice(1), value }));
export const nutrientLabels = { calories_kcal: "Energy", protein_g: "Protein", carbs_g: "Carbohydrate", fat_g: "Fat", fiber_g: "Fiber" } as const;
export function useNutritionParams() {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const one = (key: string) => typeof params[key] === "string" ? params[key] as string : undefined;
  return { foodId: one("food_id"), mealId: one("meal_id"), recipeId: one("recipe_id"), kind: mealKinds.find(k => k === one("kind")) ?? "snack" };
}
export function Back() { return <Action label="Back" secondary onPress={() => router.back()} />; }
export function Nutrients({ value, title }: { value: Partial<Schema<"Totals">>; title?: string }) {
  return <Card>{title ? <AppText variant="heading">{title}</AppText> : null}{Object.entries(nutrientLabels).map(([key, label]) => <MetricRow key={key} label={label} value={metric(value[key as keyof Schema<"Totals">], key === "calories_kcal" ? "kcal" : "g")} />)}</Card>;
}
export function MutationNote({ mutation, retryable = false, onSuccess }: { mutation: ReturnType<typeof useMutation>; retryable?: boolean; onSuccess?: (value: unknown) => void }) {
  return <>{mutation.error ? <ErrorNote message={errorMessage(mutation.error)} /> : null}{mutation.uncertain ? <Card><AppText>The save result is unknown. Keep this screen open and check saved records before starting another operation.</AppText>{retryable ? <Action label="Retry original save safely" secondary loading={mutation.pending} onPress={() => { void mutation.retry().then(value => { if (value !== undefined) onSuccess?.(value); }); }} /> : <AppText>Reload the saved record to reconcile this change before editing again.</AppText>}</Card> : null}</>;
}
export function FormError({ error }: { error: unknown }) { return <ErrorNote message={error instanceof ApiError ? errorMessage(error) : error instanceof Error ? error.message : undefined} />; }
export function Group({ children }: PropsWithChildren) { return <Card>{children}</Card>; }
/** Keeps bounded drafts in memory through failed writes and intercepts hardware/header Back. */
export function useDraftGuard(dirty: boolean, uncertain = false, pending = false) {
  const [visible, setVisible] = useState(false), [allowed, setAllowed] = useState(false);
  const repeat = useRef<() => void>(() => {});
  const disable = usePreventRemove((dirty || uncertain || pending) && !allowed, event => { repeat.current = event.repeat; setVisible(true); });
  const allow = () => { setAllowed(true); disable(); };
  return { allow, dialog: <ConfirmDialog visible={visible} title={pending ? "Save in progress" : uncertain ? "Resolve the save first" : "Discard this draft?"}
    message={pending ? "Wait for this request to finish. Your entered values stay here." : uncertain ? "The server may already have saved this request. Stay here and reconcile the saved record or retry the retained original create request before leaving." : "Unsaved changes remain here until you confirm leaving. They are not uploaded or queued automatically."}
    confirmLabel={pending || uncertain ? "Keep this screen open" : "Leave this screen"} destructive={!pending && !uncertain} onCancel={() => setVisible(false)} onConfirm={() => { setVisible(false); if (pending || uncertain) return; allow(); repeat.current(); }} /> };
}
