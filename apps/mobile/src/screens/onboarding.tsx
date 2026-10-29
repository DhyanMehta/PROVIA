import { router } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import {
  Action,
  Busy,
  Card,
  Copy,
  ErrorNote,
  Field,
  Page,
  Title,
  Value,
  ProgressBar,
} from "../components/ui";
import { useResource } from "../hooks/use-resource";
import { useApi } from "../providers/api";
import { ApiError, errorMessage } from "../lib/api-client";
import {
  createOnboardingSaver,
  decimalInput,
  loadSetup,
} from "../lib/onboarding";
import type { Schema } from "../lib/contracts";
import { metric } from "../lib/format";
import { pendingGoalStore } from "../lib/pending-goal";
import { decimalInput as boundedDecimal, kgToLb, lbToKg } from "../lib/form-values";
import { activityLevels, calculationData, friendly, goalTypes, profileInput } from "../lib/profile-values";
import { useProfileDraftGuard } from "./profile-draft";

type Setup = Awaited<ReturnType<typeof loadSetup>>;
const activities = activityLevels;

function Form({ setup }: { setup: Setup }) {
  const api = useApi();
  const save = useMemo(
    () => createOnboardingSaver(api, pendingGoalStore(setup.me.id)),
    [api, setup.me.id],
  );
  const [step, setStep] = useState(0);
  const [name, setName] = useState(setup.profile?.display_name ?? "");
  const [height, setHeight] = useState(setup.profile?.height_cm ?? "");
  const [dob, setDob] = useState(setup.profile?.date_of_birth ?? "");
  const [zone, setZone] = useState(setup.profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC");
  const [unit, setUnit] = useState<"kg" | "lb">(setup.profile?.preferred_weight_unit ?? "kg");
  const displayWeight = (value: string) => setup.profile?.preferred_weight_unit === "lb" && value ? kgToLb(value) : value;
  const [current, setCurrent] = useState(
    displayWeight(setup.active?.current_weight_kg_snapshot ??
      setup.profile?.current_weight_kg ??
      ""),
  );
  const [target, setTarget] = useState(displayWeight(setup.active?.target_weight_kg ?? ""));
  const [goalType, setGoalType] = useState<Schema<"GoalCreate">["goal_type"]>(setup.active?.goal_type ?? "weight_loss");
  const [activity, setActivity] = useState<
    Schema<"ProfilePut">["activity_level"]
  >(setup.profile?.activity_level ?? "moderate");
  const [deficit, setDeficit] = useState("500");
  const [maintenance, setMaintenance] = useState<Schema<"MaintenanceOut">>();
  const [preview, setPreview] = useState<Schema<"GoalCalculationOut">>();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [error, setError] = useState("");
  const guard = useProfileDraftGuard(step > 0 || name !== (setup.profile?.display_name ?? "") || height !== (setup.profile?.height_cm ?? "") ||
    dob !== (setup.profile?.date_of_birth ?? "") || activity !== (setup.profile?.activity_level ?? "moderate") ||
    unit !== (setup.profile?.preferred_weight_unit ?? "kg") || zone !== (setup.profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC"), busy);
  async function run(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? errorMessage(e)
          : e instanceof Error
            ? e.message
            : "Please try again.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  function validated() {
    const toKg = (value: string) => unit === "lb" ? lbToKg(decimalInput(value, "weight in pounds", 2204.623)) : value;
    return {
      current_weight_kg: decimalInput(toKg(current), "current weight", 1000),
      target_weight_kg: decimalInput(toKg(target), "target weight", 1000),
    };
  }
  async function next() {
    await run(async () => {
      if (step === 0) {
        if (!name.trim() || name.length > 100)
          throw new Error("Enter a name of 1–100 characters.");
        decimalInput(height, "height", 300, 2);
        profileInput({ display_name: name, date_of_birth: dob || null, height_cm: height, current_weight_kg: setup.profile?.current_weight_kg ?? "1", activity_level: activity, preferred_weight_unit: unit, timezone: zone });
        setStep(1);
      } else if (step === 1) {
        const weights = validated();
        setMaintenance(
          await api.request("post", "/api/v1/nutrition/calculate-maintenance", {
            authenticated: false,
            body: { current_weight_kg: weights.current_weight_kg },
            validate: value => !!value && typeof value.maintenance_calories === "string",
          }),
        );
        setStep(2);
      } else if (step === 2) {
        setStep(3);
      } else if (step === 3) {
        setPreview(
          await api.request("post", "/api/v1/nutrition/calculate-goals", {
            authenticated: false,
            body: { ...validated(), deficit_kcal: boundedDecimal(deficit, "daily deficit", 0, 24000) },
            validate: calculationData,
          }),
        );
        setStep(4);
      } else {
        const weights = validated();
        if (!preview)
          throw new Error("Preview your targets before confirming.");
        await save(
          profileInput({
            display_name: name.trim(),
            date_of_birth: dob || null,
            height_cm: height.trim(),
            current_weight_kg: weights.current_weight_kg,
            preferred_weight_unit: unit,
            activity_level: activity,
            timezone: zone,
          }),
          {
            ...weights,
            target_weight_kg: weights.target_weight_kg,
            selected_deficit_kcal: boundedDecimal(deficit, "daily deficit", 0, 24000),
            goal_type: goalType,
            daily_steps_target: setup.active?.daily_steps_target ?? null,
            status: "active",
          },
        );
        const confirmed = await loadSetup(api);
        if (!confirmed.authority.onboarding_complete || confirmed.authority.next_step !== "dashboard")
          throw new Error("Your setup is saved, but the server has not confirmed completion. Reconnect and confirm again.");
        guard.allow();
        router.replace("/dashboard");
      }
    });
  }
  const titles = [
    "A plan that fits you.",
    "Set your starting point.",
    "Your maintenance estimate.",
    "Choose a steady pace.",
    "Your plan, ready to confirm.",
  ];
  return (
    <Page>
      <Title eyebrow={`Your plan · ${step + 1} of 5`}>{titles[step]}</Title>
      <ProgressBar label="Onboarding progress" value={(step + 1) / 5} />
      {step === 0 && (
        <>
          <Copy>
            {setup.profile
              ? "Your profile is already saved. These details will be kept; this flow changes only the goal you explicitly confirm."
              : "A few details help you get started. You can review your profile anytime."}
          </Copy>
          <Field
            label="Your name"
            value={name}
            onChangeText={setName}
            editable={!setup.profile && !busy}
            autoComplete="name"
          />
          <Field
            label="Height (cm)"
            value={height}
            onChangeText={setHeight}
            editable={!setup.profile && !busy}
            keyboardType="decimal-pad"
          />
          <Field label="Date of birth (YYYY-MM-DD, optional)" value={dob} onChangeText={setDob} editable={!setup.profile && !busy} autoCapitalize="none" maxLength={10} />
          <Field label="Time zone" value={zone} onChangeText={setZone} editable={!setup.profile && !busy} autoCapitalize="none" autoCorrect={false} hint="IANA name, for example Asia/Kolkata. Dates follow this zone." />
          <Copy>Preferred weight unit</Copy>
          {(["kg", "lb"] as const).map(value => <Action key={value} label={`${unit === value ? "Selected · " : ""}${value === "kg" ? "Kilograms" : "Pounds"}`} secondary={unit !== value} disabled={!!setup.profile || busy} onPress={() => { if (value !== unit) { const convert = value === "lb" ? kgToLb : lbToKg; if (current) setCurrent(convert(current)); if (target) setTarget(convert(target)); setUnit(value); } }} />)}
          <Copy>Usual activity level</Copy>
          <View style={{ gap: 8 }}>
            {activities.map((item) => (
              <Action
                key={item}
                label={`${item === activity ? "✓ " : ""}${item.replace("_", " ")}`}
                secondary={activity !== item}
                disabled={!!setup.profile || busy}
                onPress={() => setActivity(item)}
              />
            ))}
          </View>
        </>
      )}
      {step === 1 && (
        <>
          <Copy>Your fitness goal</Copy>
          {goalTypes.map(value => <Action key={value} label={`${goalType === value ? "Selected · " : ""}${friendly(value)}`} secondary={goalType !== value} disabled={busy} onPress={() => setGoalType(value)} />)}
          <Copy>
            Weights here define the goal you confirm. Entering a value alone
            does not change existing profile or historical goals.
          </Copy>
          <Field
            label={`Current weight (${unit})`}
            value={current}
            onChangeText={setCurrent}
            keyboardType="decimal-pad"
            editable={!busy}
          />
          <Field
            label={`Target weight (${unit})`}
            value={target}
            onChangeText={setTarget}
            keyboardType="decimal-pad"
            editable={!busy}
          />
          <Copy>Values are stored in kilograms. Goal labels do not change the approved backend calculation.</Copy>
        </>
      )}
      {step === 2 && maintenance && (
        <>
          <Card>
            <Value
              label="Estimated maintenance"
              value={metric(maintenance.maintenance_calories, "kcal / day")}
            />
          </Card>
          <Copy>
            This estimate comes from PROVIA’s backend. It is a starting point,
            not a medical prescription.
          </Copy>
        </>
      )}
      {step === 3 && (
        <>
          <Copy>
            Select a daily calorie deficit. The backend checks that your calorie
            and macro targets remain valid before showing a preview.
          </Copy>
          {["0", "250", "500", "750"].map((value) => (
            <Action
              key={value}
              label={`${value === deficit ? "✓ " : ""}${value === "0" ? "Maintain · no deficit" : `${value} kcal deficit`}`}
              secondary={value !== deficit}
              disabled={busy}
              onPress={() => setDeficit(value)}
            />
          ))}
          <Field label="Daily calorie deficit (custom)" value={deficit} onChangeText={setDeficit} keyboardType="decimal-pad" editable={!busy} hint="The server validates its minimum calorie and macro requirements before saving." />
        </>
      )}
      {step === 4 && preview && (
        <>
          <Card>
            <Value label="Goal" value={friendly(goalType)} />
            <Value label="Estimated maintenance" value={metric(preview.maintenance_calories, "kcal / day")} />
            <Value
              label="Daily calorie target"
              value={metric(preview.daily_calorie_target, "kcal")}
            />
            <Value
              label="Protein"
              value={metric(preview.protein_target_g, "g")}
            />
            <Value label="Carbs" value={metric(preview.carbs_target_g, "g")} />
            <Value label="Fat" value={metric(preview.fat_target_g, "g")} />
            <Value label="Fiber" value={metric(preview.fiber_target_g, "g")} />
          </Card>
          <Copy>
            Confirming saves your profile if needed and activates this goal.
            Previous goal snapshots are preserved. If a save is interrupted, try
            again after reconnecting: PROVIA reconciles the saved goal. An
            unresolved earlier save blocks another creation until its outcome is
            confirmed.
          </Copy>
        </>
      )}
      {error && <ErrorNote message={error} />}
      <Action
        label={
          busy
            ? "Working…"
            : step === 4
              ? "Confirm my plan"
              : step === 3
                ? "Preview my targets"
                : "Continue"
        }
        disabled={busy}
        onPress={() => void next()}
      />
      {step > 0 && (
        <Action
          secondary
          label="Back"
          disabled={busy}
          onPress={() => {
            setError("");
            setStep(step - 1);
          }}
        />
      )}
      {guard.dialog}
    </Page>
  );
}
export default function Onboarding() {
  const api = useApi();
  const load = useCallback(
    (signal: AbortSignal) => loadSetup(api, signal),
    [api],
  );
  const { data, error, reload } = useResource(load);
  if (!data)
    return (
      <Page>
        {error ? (
          <>
            <ErrorNote message={errorMessage(error)} />
            <Action label="Retry" onPress={reload} />
          </>
        ) : (
          <Busy label="Loading your saved profile…" />
        )}
      </Page>
    );
  return <Form setup={data} />;
}
