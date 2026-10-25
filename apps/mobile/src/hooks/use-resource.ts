import { useCallback, useEffect, useState } from "react";
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [result, setResult] = useState<{
    data?: T;
    error: unknown;
    revision: number;
  }>({ error: null, revision: -1 });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setResult({ data, error: null, revision });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult((previous) => ({ data: previous.data, error, revision }));
      });
    return () => controller.abort();
  }, [load, revision]);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return {
    data: result.data,
    error: result.revision === revision ? result.error : null,
    loading: result.revision !== revision,
    reload,
  };
}
