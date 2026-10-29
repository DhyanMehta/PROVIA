import { useAuth } from "./auth";
import { fetch as expoFetch } from "expo/fetch";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo } from "react";
import { AppState } from "react-native";
import { ResourceScope } from "../lib/resource-scope";
import type { PropsWithChildren } from "react";
import {
  createApiClient,
  errorMessage,
  type ApiClient,
} from "../lib/api-client";
const Context = createContext<ApiClient | null>(null);
export function ApiProvider({
  children,
  baseUrl,
}: PropsWithChildren<{ baseUrl: string }>) {
  const { getToken, userId, session } = useAuth();
  const generation = session.getGeneration();
  const api = useMemo(
    () =>
      createApiClient(
        baseUrl,
        getToken,
        expoFetch as typeof fetch,
        () =>
          session.getGeneration() === generation &&
          (session.getSnapshot().user?.id ?? null) === (userId ?? null),
        (error) => {
          void session.clear(errorMessage(error)).catch(() => {});
        },
      ),
    [baseUrl, getToken, userId, session, generation],
  );
  useLayoutEffect(() => {
    api.resume();
    return () => {
      api.pause();
      api.cancelAll();
    };
  }, [api]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") api.invalidate(); });
    // Refresh mounted read models across profile-zone midnight, without polling writes.
    const timer = setInterval(() => { if (AppState.currentState === "active") api.invalidate(); }, 60000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [api]);
  return <Context.Provider value={api}><ResourceScope.Provider value={api}>{children}</ResourceScope.Provider></Context.Provider>;
}
export function useApi() {
  const api = useContext(Context);
  if (!api) throw new Error("API provider is missing");
  return api;
}
