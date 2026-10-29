import { useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { ApiError } from "../lib/api-client";
import { ResourceScope } from "../lib/resource-scope";
const noSubscribe = () => () => {};
const zero = () => 0;
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const api = useContext(ResourceScope);
  const sharedRevision = useSyncExternalStore(api?.subscribe ?? noSubscribe, api?.getRevision ?? zero, zero);
  const [result, setResult] = useState<{
    data?: T;
    error: unknown;
    revision: number;
    load?: (signal: AbortSignal) => Promise<T>;
  }>({ error: null, revision: -1 });
  const [revision, setRevision] = useState(0);
  const currentRevision = revision + sharedRevision;
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
          setResult({ data, error: null, revision: currentRevision, load });
      })
      .catch((error) => {
        if (!controller.signal.aborted || expired)
          setResult((previous) => ({ data: previous.data, error, revision: currentRevision, load }));
      })
      .finally(() => clearTimeout(timer));
    return () => {
      expired = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [load, currentRevision]);
  const reload = useCallback(() => { api?.invalidate(); setRevision((value) => value + 1); }, [api]);
  return {
    data: result.data,
    error: result.revision === currentRevision && result.load === load ? result.error : null,
    loading: result.revision !== currentRevision || result.load !== load,
    reload,
  };
}
