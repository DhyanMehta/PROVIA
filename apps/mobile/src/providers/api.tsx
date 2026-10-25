import { useAuth, useClerk } from "@clerk/expo";
import { fetch as expoFetch } from "expo/fetch";
import { createContext, useContext, useLayoutEffect, useMemo } from "react";
import type { PropsWithChildren } from "react";
import { createApiClient, type ApiClient } from "../lib/api-client";
const Context = createContext<ApiClient | null>(null);
export function ApiProvider({
  children,
  baseUrl,
}: PropsWithChildren<{ baseUrl: string }>) {
  const { getToken, userId } = useAuth();
  const clerk = useClerk();
  const api = useMemo(
    () =>
      createApiClient(
        baseUrl,
        (refresh) => getToken({ skipCache: !!refresh }),
        expoFetch as typeof fetch,
        () => (clerk.user?.id ?? null) === (userId ?? null),
      ),
    [baseUrl, getToken, userId, clerk],
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
