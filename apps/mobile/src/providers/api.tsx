import { useAuth } from "./auth";
import { fetch as expoFetch } from "expo/fetch";
import { createContext, useContext, useLayoutEffect, useMemo } from "react";
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
  return <Context.Provider value={api}>{children}</Context.Provider>;
}
export function useApi() {
  const api = useContext(Context);
  if (!api) throw new Error("API provider is missing");
  return api;
}
