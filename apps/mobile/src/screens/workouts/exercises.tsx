import { useCallback, useState } from "react";
import { FlatList, View } from "react-native";
import { router } from "expo-router";
import { Action, AppText, Card, ConfirmDialog, Copy, EmptyState, ErrorNote, Field, Page, PhotoContainer, SelectField, Title } from "../../components/ui";
import { useResource } from "../../hooks/use-resource";
import { useMutation } from "../../hooks/use-mutation";
import type { Schema } from "../../lib/contracts";
import { useApi } from "../../providers/api";
import { useAuth } from "../../providers/auth";
import { categories, exercise, exerciseCheck, exercises, type Exercise } from "./data";
import { inputError, LoadState, MutationState, Pager, useRouteId } from "./common";
import { useWorkoutDraftGuard } from "./draft-guard";

const categoryOptions = categories.map(value => ({ label: value[0].toUpperCase() + value.slice(1), value }));
function ExerciseFilters({ onSearch }: { onSearch: (value: { q: string; category?: typeof categories[number]; muscle_group: string; equipment: string }) => void }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("");
  const [muscle, setMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  return <Card><Field label="Search exercises" value={q} onChangeText={setQ} maxLength={200} returnKeyType="search" /><SelectField label="Category filter" value={category} options={[{ label: "All categories", value: "" }, ...categoryOptions]} onValueChange={setCategory} /><Field label="Muscle group filter" value={muscle} onChangeText={setMuscle} /><Field label="Equipment filter" value={equipment} onChangeText={setEquipment} /><Action label="Search catalog" secondary onPress={() => onSearch({ q: q.trim(), category: categories.find(item => item === category), muscle_group: muscle.trim(), equipment: equipment.trim() })} /></Card>;
}
export function ExercisePicker({ onSelect, onClose }: { onSelect: (row: Exercise) => void; onClose: () => void }) {
  const api = useApi();
  const [query, setQuery] = useState({ q: "", offset: 0 });
  const result = useResource(useCallback(signal => exercises(api, query, signal), [api, query]));
  return <Card><Title eyebrow="Catalog">Choose an exercise</Title><Field label="Find exercise" value={query.q} onChangeText={q => setQuery({ q, offset: 0 })} maxLength={200} /><LoadState resource={result}>{result.data?.items.map(row => <Action key={row.id} label={`${row.name} · ${row.muscle_group}`} onPress={() => onSelect(row)} secondary />)}{result.data?.items.length === 0 ? <EmptyState title="No matching exercises" message="Change your search or create a custom exercise from the exercise library." /> : null}{result.data ? <Pager count={result.data.items.length} offset={query.offset} onChange={offset => setQuery({ ...query, offset })} /> : null}</LoadState><Action label="Close exercise picker" onPress={onClose} secondary /></Card>;
}
export function ExercisesScreen() {
  const api = useApi();
  const [query, setQuery] = useState<{ q: string; category?: typeof categories[number]; muscle_group?: string; equipment?: string; offset: number }>({ q: "", offset: 0 });
  const result = useResource(useCallback(signal => exercises(api, query, signal), [api, query]));
  return <Page scroll={false}><FlatList data={result.data?.items ?? []} keyExtractor={row => row.id} keyboardShouldPersistTaps="handled" refreshing={result.loading} onRefresh={result.reload} contentContainerStyle={{ gap: 16, paddingBottom: 32 }}
    ListHeaderComponent={<View style={{ gap: 20 }}><Title eyebrow="Workouts">Exercise library</Title><Copy>Find your movement, learn the setup and view your recorded training.</Copy><Action label="Create custom exercise" onPress={() => router.push("/workouts/exercises/new")} /><ExerciseFilters onSearch={value => setQuery({ ...value, offset: 0 })} /><LoadState resource={result} /></View>}
    renderItem={({ item }) => <Card><AppText variant="heading">{item.name}</AppText><Copy>{item.muscle_group} · {item.equipment} · {item.category ?? "Uncategorized"}</Copy><Action label={`View ${item.name}`} secondary onPress={() => router.push({ pathname: "/workouts/exercises/[exerciseId]", params: { exerciseId: item.id } })} /></Card>}
    ListEmptyComponent={!result.loading && result.data ? <EmptyState title="No matches" message="Try different filters or add your own exercise." /> : undefined}
    ListFooterComponent={result.data ? <Pager count={result.data.items.length} offset={query.offset} onChange={offset => setQuery({ ...query, offset })} /> : undefined} /></Page>;
}
export function ExerciseScreen() {
  const exerciseId = useRouteId("exerciseId");
  const api = useApi();
  const { userId } = useAuth();
  const result = useResource(useCallback(signal => exercise(api, exerciseId, signal), [api, exerciseId]));
  const mutation = useMutation();
  const [confirm, setConfirm] = useState(false);
  const [reconcileError, setReconcileError] = useState<string>();
  const row = result.data;
  return <Page refreshing={result.loading} onRefresh={result.reload}><Title eyebrow="Exercise">{row?.name ?? "Exercise details"}</Title><LoadState resource={result}>{row ? <>
    <PhotoContainer uri={row.media_reference} label={`${row.name} demonstration`} /><Card><Copy>{row.category ?? "Uncategorized"} · {row.muscle_group} · {row.equipment}</Copy>{row.secondary_muscles.length ? <Copy>Also works {row.secondary_muscles.join(", ")}</Copy> : null}{row.difficulty ? <Copy>{row.difficulty} level</Copy> : null}{row.movement_type ? <Copy>Movement: {row.movement_type}</Copy> : null}<AppText>{row.description ?? "No description supplied."}</AppText><AppText variant="heading">Instructions</AppText><AppText>{row.instructions ?? "No instructions supplied. Ask a qualified trainer if you are unsure about technique."}</AppText></Card>
    <Action label="View recorded exercise progress" onPress={() => router.push({ pathname: "/workouts/exercises/[exerciseId]/history", params: { exerciseId } })} secondary />
    {row.is_archived ? <Copy>This exercise is archived. Existing training history is preserved; it cannot be added to new plans or sets.</Copy> : <Action label="Add to a workout plan" onPress={() => router.push({ pathname: "/workouts/plans", params: { exerciseId } })} />}
    {!row.is_archived && row.created_by_user_id === userId ? <><Action label="Edit custom exercise" onPress={() => router.push({ pathname: "/workouts/exercises/[exerciseId]/edit", params: { exerciseId } })} secondary /><Action label="Archive exercise" variant="danger" onPress={() => setConfirm(true)} disabled={mutation.pending || mutation.uncertain} /></> : null}
  </> : null}</LoadState><ErrorNote message={reconcileError} /><MutationState mutation={mutation} onReconcile={() => { void exercise(api, exerciseId, undefined, true).then(() => { mutation.reset(); setConfirm(false); result.reload(); }).catch(failure => setReconcileError(inputError(failure))); }} /><ConfirmDialog visible={confirm} title="Archive this exercise?" message="It will leave the catalog. Your existing plans and workout history retain their references." confirmLabel="Archive exercise" destructive busy={mutation.pending} onCancel={() => setConfirm(false)} onConfirm={() => { void mutation.run(async () => { await api.request("delete", "/api/v1/exercises/custom/{exercise_id}", { params: { exercise_id: exerciseId } }); setConfirm(false); result.reload(); return true; }); }} /></Page>;
}
export function ExerciseFormScreen({ editing = false }: { editing?: boolean }) {
  const exerciseId = useRouteId("exerciseId");
  const api = useApi();
  const result = useResource(useCallback(signal => editing ? exercise(api, exerciseId, signal) : Promise.resolve(null), [api, exerciseId, editing]));
  return <Page><Title eyebrow="Exercise library">{editing ? "Edit custom exercise" : "Create custom exercise"}</Title><LoadState resource={result}>{(!editing || result.data) ? <ExerciseForm key={result.data?.id ?? "new"} row={result.data ?? undefined} /> : null}</LoadState></Page>;
}
function ExerciseForm({ row }: { row?: Exercise }) {
  const api = useApi();
  const { userId } = useAuth();
  const [name, setName] = useState(row?.name ?? "");
  const [muscle, setMuscle] = useState(row?.muscle_group ?? "");
  const [equipment, setEquipment] = useState(row?.equipment ?? "");
  const [category, setCategory] = useState<typeof categories[number]>(categories.find(item => item === row?.category) ?? "strength");
  const [instructions, setInstructions] = useState(row?.instructions ?? "");
  const [description, setDescription] = useState(row?.description ?? "");
  const [secondary, setSecondary] = useState(row?.secondary_muscles.join(", ") ?? "");
  const [movement, setMovement] = useState(row?.movement_type ?? "");
  const [difficulty, setDifficulty] = useState(row?.difficulty ?? "");
  const [media, setMedia] = useState(row?.media_reference ?? "");
  const [error, setError] = useState<string>();
  const mutation = useMutation();
  const locked = mutation.pending || mutation.uncertain;
  const fields = JSON.stringify([name, muscle, equipment, category, instructions, description, secondary, movement, difficulty, media]);
  const [baseline] = useState(fields);
  const guard = useWorkoutDraftGuard(fields !== baseline, mutation.pending, mutation.uncertain);
  if (row && (row.created_by_user_id !== userId || row.is_archived)) return <Copy>Only your own unarchived custom exercises can be edited.</Copy>;
  const save = () => {
    try {
      setError(undefined);
      if (!name.trim() || !muscle.trim() || !equipment.trim()) throw new Error("Name, muscle group and equipment are required.");
      const extra = secondary.split(",").map(value => value.trim()).filter(Boolean);
      if (extra.length > 20 || extra.some(value => value.length > 100)) throw new Error("Use up to 20 secondary muscles, each at most 100 characters.");
      if (media.trim() && !/^https:\/\/[^\s]+$/.test(media.trim())) throw new Error("Media must use a valid HTTPS URL that you have permission to reuse.");
      const body: Schema<"ExerciseCreate"> = { name: name.trim(), muscle_group: muscle.trim(), equipment: equipment.trim(), category, instructions: instructions.trim() || null, description: description.trim() || null, secondary_muscles: extra, movement_type: movement.trim() || null, difficulty: difficulty ? difficulty as "beginner" | "intermediate" | "advanced" : null, media_reference: media.trim() || null };
      void mutation.run(async key => {
        const saved = row ? await api.request("patch", "/api/v1/exercises/custom/{exercise_id}", { params: { exercise_id: row.id }, body, validate: exerciseCheck }) : await api.request("post", "/api/v1/exercises/custom", { body, idempotencyKey: key, validate: exerciseCheck });
        guard.allowLeave();
        router.replace({ pathname: "/workouts/exercises/[exerciseId]", params: { exerciseId: saved.id } });
        return saved;
      }, { idempotent: !row });
    } catch (e) { setError(inputError(e)); }
  };
  return <>{guard.dialog}<Field editable={!locked} label="Exercise name" value={name} onChangeText={setName} maxLength={200} /><Field editable={!locked} label="Primary muscle group" value={muscle} onChangeText={setMuscle} maxLength={100} /><Field editable={!locked} label="Equipment" value={equipment} onChangeText={setEquipment} maxLength={100} /><SelectField disabled={locked} label="Exercise category" value={category} options={categoryOptions} onValueChange={setCategory} /><Field editable={!locked} label="Description" value={description} onChangeText={setDescription} multiline maxLength={4000} /><Field editable={!locked} label="Instructions" value={instructions} onChangeText={setInstructions} multiline maxLength={4000} /><Field editable={!locked} label="Secondary muscles" hint="Separate muscles with commas" value={secondary} onChangeText={setSecondary} /><Field editable={!locked} label="Movement type" value={movement} onChangeText={setMovement} maxLength={100} /><SelectField disabled={locked} label="Difficulty" value={difficulty} onValueChange={setDifficulty} options={[{ label: "Not specified", value: "" }, { label: "Beginner", value: "beginner" }, { label: "Intermediate", value: "intermediate" }, { label: "Advanced", value: "advanced" }]} /><Field editable={!locked} label="Optional demonstration HTTPS URL" hint="Use only legally reusable media. Leave blank if unavailable." value={media} onChangeText={setMedia} autoCapitalize="none" maxLength={1000} /><ErrorNote message={error} /><MutationState mutation={mutation} canRetry={!row} onReconcile={() => { if (row) void exercise(api, row.id, undefined, true).then(actual => { mutation.reset(); setError(`Latest saved exercise: ${actual.name} · ${actual.muscle_group} · ${actual.equipment}. Your draft is retained; review it before saving a correction.`); }).catch(failure => setError(inputError(failure))); }} /><Action label="Save exercise" onPress={save} loading={mutation.pending} disabled={mutation.uncertain} /></>;
}
