import * as SecureStore from "expo-secure-store";
import { fetch as expoFetch } from "expo/fetch";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { createAuthSession, type AuthSession } from "../lib/auth-session";

const KEY = "provia.auth.refresh.v1";
const Context = createContext<AuthSession | null>(null);
export function AuthProvider({
  baseUrl,
  children,
}: PropsWithChildren<{ baseUrl: string }>) {
  const session = useMemo(
    () =>
      createAuthSession(
        baseUrl,
        {
          read: () => SecureStore.getItemAsync(KEY),
          write: (value) => SecureStore.setItemAsync(KEY, value),
          clear: () => SecureStore.deleteItemAsync(KEY),
        },
        expoFetch as typeof fetch,
      ),
    [baseUrl],
  );
  useEffect(() => {
    void session.restore();
  }, [session]);
  return <Context.Provider value={session}>{children}</Context.Provider>;
}
export function useAuth() {
  const session = useContext(Context);
  if (!session) throw new Error("Authentication provider is missing");
  const state = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  return useMemo(
    () => ({
      ...state,
      session,
      isLoaded: state.loaded,
      isSignedIn: !!state.user,
      userId: state.user?.id ?? null,
      getToken: session.getToken,
      signOut: session.signOut,
    }),
    [state, session],
  );
}
