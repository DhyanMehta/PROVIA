import { router } from "expo-router";
import { Action } from "../../components/ui";
import { useMutation } from "../../hooks/use-mutation";
import { ApiError } from "../../lib/api-client";
import { useApi } from "../../providers/api";
import { activeWorkout, workoutCheck } from "./data";
import { MutationState } from "./common";
import { useWorkoutDraftGuard } from "./draft-guard";

export function StartWorkout({ dayId, label = "Start an unplanned workout" }: { dayId?: string; label?: string }) {
  const api = useApi();
  const mutation = useMutation();
  const guard = useWorkoutDraftGuard(false, mutation.pending, mutation.uncertain);
  return <>{guard.dialog}<Action label={label} disabled={mutation.uncertain} loading={mutation.pending} onPress={() => {
    const body = { started_at: new Date().toISOString(), ...(dayId ? { workout_plan_day_id: dayId } : {}) };
    void mutation.run(async key => {
      try {
        const saved = await api.request("post", "/api/v1/workout-sessions", { body, idempotencyKey: key, validate: workoutCheck });
        guard.allowLeave();
        router.push({ pathname: "/workouts/sessions/[sessionId]", params: { sessionId: saved.id } });
        return saved;
      } catch (e) {
        if (e instanceof ApiError && e.code === "ACTIVE_WORKOUT_EXISTS") {
          const actual = await activeWorkout(api);
          if (actual) { guard.allowLeave(); router.push({ pathname: "/workouts/sessions/[sessionId]", params: { sessionId: actual.id } }); return actual; }
        }
        throw e;
      }
    }, { idempotent: true });
  }} /><MutationState mutation={mutation} canRetry /></>;
}
