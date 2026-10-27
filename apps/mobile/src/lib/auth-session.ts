import { ApiError, createApiClient, errorMessage } from "./api-client";
import type { Schema } from "./contracts";

export type AuthStorage = {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  clear(): Promise<void>;
};
export type AuthState = {
  loaded: boolean;
  user: Schema<"AccountOut"> | null;
  error: string | null;
  logoutPending?: boolean;
};

// Native storage cannot be cancelled. Timeout callers without releasing the
// underlying write queue: late persistence must still precede logout cleanup.
function storageDeadline<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ApiError(
      "Secure storage did not respond. Try again.", 0, "STORAGE_TIMEOUT",
    )), 10000);
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}
function validAccount(value: unknown): value is Schema<"AccountOut"> {
  if (!value || typeof value !== "object") return false;
  const account = value as Partial<Schema<"AccountOut">>;
  return (
    typeof account.id === "string" &&
    account.id.length > 0 &&
    typeof account.email === "string" &&
    typeof account.name === "string" &&
    typeof account.email_verified === "boolean" &&
    (account.status === "active" || account.status === "pending_verification")
  );
}

// A refresh marker is persisted BEFORE the rotation request. A crash/lost response
// cannot cause a later app launch to replay a possibly consumed refresh token.
export function createAuthSession(
  baseUrl: string,
  storage: AuthStorage,
  transport: typeof fetch = fetch,
) {
  const publicApi = createApiClient(baseUrl, async () => null, transport);
  let state: AuthState = { loaded: false, user: null, error: null };
  const listeners = new Set<() => void>();
  let access: string | null = null;
  let refresh: string | null = null;
  let pendingLogout: string | null = null;
  let expires = 0;
  let generation = 0;
  let flight: Promise<string | null> | null = null;
  let restoreFlight: Promise<void> | null = null;
  let writes = Promise.resolve();
  const publish = (next: AuthState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  function persist(task: () => Promise<void>) {
    const next = writes.then(task, task);
    writes = next.catch(() => {});
    return storageDeadline(next);
  }
  async function forget(message: string | null = null) {
    const version = ++generation;
    access = refresh = null;
    expires = 0;
    flight = null;
    publish({ loaded: true, user: null, error: message });
    await persist(() => storage.clear());
    return version;
  }
  async function accept(result: Schema<"TokenOut">, version: number) {
    if (version !== generation)
      throw new ApiError("Session changed.", 401, "SESSION_CHANGED");
    if (
      !result ||
      typeof result.access_token !== "string" ||
      !result.access_token ||
      result.access_token.length > 4096 ||
      typeof result.refresh_token !== "string" ||
      !result.refresh_token ||
      result.refresh_token.length > 512 ||
      result.token_type !== "bearer" ||
      !validAccount(result.user) ||
      !Number.isInteger(result.expires_in) ||
      result.expires_in < 60 ||
      result.expires_in > 900
    )
      throw new ApiError(
        "Invalid authentication response.",
        200,
        "INVALID_RESPONSE",
      );
    await persist(async () => {
      if (version !== generation)
        throw new ApiError("Session changed.", 401, "SESSION_CHANGED");
      await storage.write(
        JSON.stringify({ refresh: result.refresh_token, rotating: false }),
      );
    });
    if (version !== generation)
      throw new ApiError("Session changed.", 401, "SESSION_CHANGED");
    access = result.access_token;
    refresh = result.refresh_token;
    expires = Date.now() + result.expires_in * 1000;
    publish({ loaded: true, user: result.user, error: null });
    return access;
  }
  function rotate(): Promise<string | null> {
    if (flight) return flight;
    if (!refresh) return Promise.resolve(null);
    const version = generation,
      previous = refresh;
    const operation = (async () => {
      try {
        await persist(async () => {
          if (version !== generation)
            throw new ApiError("Session changed.", 401, "SESSION_CHANGED");
          await storage.write(
            JSON.stringify({ refresh: previous, rotating: true }),
          );
        });
        if (version !== generation)
          throw new ApiError("Session changed.", 401, "SESSION_CHANGED");
        const result = await publicApi.request("post", "/api/v1/auth/refresh", {
          authenticated: false,
          body: { refresh_token: previous },
          timeoutMs: 90000,
        });
        return await accept(result, version);
      } catch (error) {
        if (version === generation) {
          await forget(
            "Your session could not be restored safely. Sign in again. " +
              errorMessage(error),
          ).catch(() => {});
        }
        throw error;
      }
    })();
    flight = operation;
    void operation
      .finally(() => {
        if (flight === operation) flight = null;
      })
      .catch(() => {});
    return operation;
  }
  async function getToken(
    force = false,
    rejectedToken?: string,
  ): Promise<string | null> {
    if (
      access &&
      expires > Date.now() + 30000 &&
      (!force || (rejectedToken && rejectedToken !== access))
    )
      return access;
    return rotate();
  }
  function restore() {
    if (restoreFlight) return restoreFlight;
    const version = generation;
    restoreFlight = (async () => {
      try {
        const raw = await storageDeadline(storage.read());
        if (version !== generation) return;
        if (!raw) {
          publish({ loaded: true, user: null, error: null });
          return;
        }
        const saved = JSON.parse(raw);
        if (typeof saved.refresh !== "string" || saved.rotating !== false) {
          await forget("A session update was interrupted. Sign in again.");
          return;
        }
        refresh = saved.refresh;
        await rotate();
      } catch (error) {
        if (version === generation)
          await forget(
            "Session restoration failed. Sign in again. " + errorMessage(error),
          ).catch(() => {});
      }
    })();
    return restoreFlight;
  }
  async function signIn(email: string, password: string) {
    const version = await forget();
    if (version !== generation)
      throw new ApiError("Session changed.", 401, "SESSION_CHANGED");
    try {
      const result = await publicApi.request("post", "/api/v1/auth/login", {
        authenticated: false,
        timeoutMs: 90000,
        body: { email, password, device_label: "PROVIA Android" },
      });
      await accept(result, version);
    } catch (error) {
      if (version === generation)
        await forget(errorMessage(error)).catch(() => {});
      throw error;
    }
  }
  async function signOut() {
    const previous = refresh ?? pendingLogout;
    pendingLogout = previous;
    // Local deletion can fail independently of server revocation. Always attempt
    // both, so a retained SecureStore value cannot restore a revoked session.
    const clearing = forget();
    const version = generation;
    let localFailure = false;
    await clearing.catch(() => {
      localFailure = true;
    });
    try {
      if (previous)
        await publicApi.request("post", "/api/v1/auth/logout", {
          authenticated: false,
          body: { refresh_token: previous },
          timeoutMs: 15000,
        });
      if (pendingLogout === previous) pendingLogout = null;
      if (localFailure && version === generation)
        publish({
          loaded: true,
          user: null,
          error:
            "Signed out on the server. Secure storage cleanup failed; retry cleanup before changing accounts.",
          logoutPending: true,
        });
    } catch (error) {
      if (version === generation)
        publish({
          loaded: true,
          user: null,
          error: localFailure
            ? "Sign-out could not be confirmed: secure storage cleanup and server revocation failed. Reconnect and sign out again before sharing this device."
            : "Signed out on this device. Server session revocation could not be confirmed.",
          logoutPending: true,
        });
      throw error;
    }
  }
  async function reloadUser() {
    const version = generation;
    const api = createApiClient(
      baseUrl,
      getToken,
      transport,
      () => version === generation,
      (error) => {
        void forget(errorMessage(error)).catch(() => {});
      },
    );
    const user = await api.request("get", "/api/v1/auth/me");
    if (!validAccount(user))
      throw new ApiError("Invalid account response.", 200, "INVALID_RESPONSE");
    if (version === generation) publish({ loaded: true, user, error: null });
  }
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    getGeneration: () => generation,
    getToken,
    restore,
    signIn,
    signOut,
    reloadUser,
    publicApi,
    clear: forget,
  };
}
export type AuthSession = ReturnType<typeof createAuthSession>;
