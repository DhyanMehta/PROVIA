import { useCallback } from "react";
import { useResource } from "../../hooks/use-resource";
import { ApiError } from "../../lib/api-client";
import { useApi } from "../../providers/api";
import { exercise } from "./data";

/** The plan contract stores exercise IDs; resolve visible names with bounded concurrency. */
export function useExerciseNames(ids: string[]) {
  const api = useApi();
  const identity = [...new Set(ids)].sort().join(",");
  return useResource(useCallback(async signal => {
    const pending = identity ? identity.split(",") : [];
    const names: Record<string, string> = {};
    await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
      while (pending.length && !signal.aborted) {
        const id = pending.shift()!;
        try { names[id] = (await exercise(api, id, signal)).name; }
        catch (e) { if (e instanceof ApiError && e.status === 404) names[id] = "Unavailable exercise"; else throw e; }
      }
    }));
    return names;
  }, [api, identity]));
}
