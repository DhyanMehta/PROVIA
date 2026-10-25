import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../lib/api-client";
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [result, setResult] = useState<{
    data?: T;
    error: unknown;
    revision: number;
  }>({ error: null, revision: -1 });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let expired = false;
    // Bound the entire screen load, including paginated/sequential requests.
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        expired = true;
        controller.abort();
        reject(new ApiError("Screen loading timed out.", 0, "TIMEOUT"));
      }, 120000);
    });
    Promise.race([load(controller.signal), deadline])
      .then((data) => {
        if (!controller.signal.aborted)
          setResult({ data, error: null, revision });
      })
      .catch((error) => {
        if (!controller.signal.aborted || expired)
          setResult((previous) => ({ data: previous.data, error, revision }));
      })
      .finally(() => clearTimeout(timer));
    return () => {
      expired = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [load, revision]);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return {
    data: result.data,
    error: result.revision === revision ? result.error : null,
    loading: result.revision !== revision,
    reload,
  };
}
