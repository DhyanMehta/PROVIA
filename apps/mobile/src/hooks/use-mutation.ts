import { useCallback, useEffect, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import { ApiError } from "../lib/api-client";

type Task = { operation: (key: string) => Promise<unknown>; key: string; idempotent: boolean };
/** No automatic write retries. Unknown creates retain the original closure and UUID. */
export function useMutation() {
  const [state, setState] = useState<{ pending: boolean; error: unknown; uncertain: boolean }>({ pending: false, error: null, uncertain: false });
  const task = useRef<Task | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; task.current = null; }; }, []);
  const execute = useCallback(async (current: Task) => {
    if (busy.current) return;
    busy.current = true;
    setState({ pending: true, error: null, uncertain: false });
    try {
      const result = await current.operation(current.key);
      task.current = null;
      if (mounted.current) setState({ pending: false, error: null, uncertain: false });
      return result;
    } catch (error) {
      const uncertain = error instanceof ApiError && error.uncertainWrite;
      if (!uncertain) task.current = null;
      if (mounted.current) setState({ pending: false, error, uncertain });
      return undefined;
    } finally { busy.current = false; }
  }, []);
  const run = useCallback(async <T,>(operation: (key: string) => Promise<T>, options?: { idempotent?: boolean }): Promise<T | undefined> => {
    if (busy.current || task.current) return undefined;
    const current = { operation, key: randomUUID(), idempotent: options?.idempotent ?? false };
    task.current = current;
    return await execute(current) as T | undefined;
  }, [execute]);
  const retry = useCallback(async () => {
    if (!task.current?.idempotent || busy.current) return;
    return execute(task.current);
  }, [execute]);
  const reset = useCallback(() => { if (!busy.current) { task.current = null; setState({ pending: false, error: null, uncertain: false }); } }, []);
  return { ...state, run, retry, reset };
}
