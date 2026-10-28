import type { paths } from "./contracts";
import {
  failureCategory,
  safeRequestId,
  safeRoute,
  safeServerCode,
  type RequestDiagnostic,
} from "./api-diagnostics";

type Verb = "get" | "post" | "put" | "patch" | "delete";
type Method<P extends keyof paths> = Extract<keyof paths[P], Verb>;
type Operation<P extends keyof paths, M extends Method<P>> = paths[P][M];
type Body<P extends keyof paths, M extends Method<P>> =
  Operation<P, M> extends {
    requestBody: { content: { "application/json": infer B } };
  }
    ? B
    : never;
type Query<P extends keyof paths, M extends Method<P>> =
  Operation<P, M> extends { parameters: { query?: infer Q } } ? Q : never;
type Success<O> = O extends { responses: infer R }
  ? {
      [K in keyof R]: K extends 200 | 201 | 202
        ? R[K] extends { content: { "application/json": infer T } }
          ? T
          : never
        : K extends 204
          ? undefined
          : never;
    }[keyof R]
  : never;
type Token = (
  refresh?: boolean,
  rejectedToken?: string,
) => Promise<string | null>;

function abortable<T>(promise: Promise<T>, signal: AbortSignal) {
  return new Promise<T>((resolve, reject) => {
    const cancel = () =>
      reject(
        new ApiError("Token request cancelled or timed out.", 0, "ABORTED"),
      );
    signal.addEventListener("abort", cancel, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", cancel);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", cancel);
        reject(error);
      },
    );
    if (signal.aborted) cancel();
  });
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code = "NETWORK_ERROR",
    public requestId: string | null = null,
    public uncertainWrite = false,
    public diagnostic?: RequestDiagnostic,
  ) {
    super(message);
  }
  get category() {
    return failureCategory(this.status, this.code);
  }
}

export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError))
    return "Something went wrong. Please try again.";
  const messages: Record<number, string> = {
    401: "Your session could not be verified. Sign in again.",
    403: "Access was denied. Verify your email or check your account status.",
    404: "This record is unavailable.",
    409: "Your saved data changed. Reload before confirming.",
    422: "Check the values entered. The server could not accept them.",
    429: "Too many requests. Wait before retrying.",
  };
  const categories: Partial<
    Record<ReturnType<typeof failureCategory>, string>
  > = {
    AUTH_UNAVAILABLE:
      "The backend cannot verify sessions right now. Check its authentication configuration.",
    DATABASE_UNAVAILABLE:
      "The backend is reachable, but its database is unavailable.",
    TOKEN_TIMEOUT:
      "Session renewal did not finish in time. Check your connection and sign in again.",
    TOKEN_UNAVAILABLE:
      "A session token is unavailable. Check your connection or sign in again.",
    NETWORK_TIMEOUT:
      "The backend did not respond in time. A Render cold start is possible; try again shortly.",
    NETWORK_ERROR:
      "Cannot reach the backend. Check your connection and try again.",
    CANCELLED: "The request was cancelled.",
    INVALID_RESPONSE: "The backend returned an invalid API response.",
    BACKEND_UNAVAILABLE:
      "The backend returned a server error. It may be starting; check its health and Render logs.",
  };
  const specific: Record<string, string> = {
    INVALID_ACTION:
      "This link is invalid, expired or already used. Request a new link.",
    INVALID_AUTHENTICATION:
      "Authentication could not be verified. Check your credentials or sign in again.",
    ACCOUNT_DISABLED: "This account is disabled. Contact support for access.",
    EMAIL_NOT_VERIFIED: "Verify your email before opening your fitness data.",
  };
  const text =
    specific[error.code] ??
    (error.code === "EMAIL_UNAVAILABLE"
      ? "Email delivery is unavailable. Verification and password recovery are blocked until delivery is configured and working."
      : error.uncertainWrite
        ? "The save result is unknown. Reconnect and reconcile before trying again."
        : (categories[error.category] ??
          messages[error.status] ??
          error.message));
  const context = error.diagnostic;
  return (
    text +
    ` [${error.category}; HTTP ${error.status || "none"}` +
    (context
      ? `; ${context.method} ${context.route}; ${context.phase}; ${context.durationMs}ms`
      : "") +
    "]" +
    (error.requestId ? ` Request ID: ${error.requestId}` : "")
  );
}

export function createApiClient(
  baseUrl: string,
  getToken: Token,
  transport: typeof fetch = fetch,
  isCurrentSession: () => boolean = () => true,
  onAuthRejected: (error: ApiError) => void = () => {},
) {
  const pending = new Set<AbortController>();
  let active = true;
  async function request<P extends keyof paths, M extends Method<P>>(
    method: M,
    path: P,
    options: {
      body?: Body<P, M>;
      query?: Query<P, M>;
      signal?: AbortSignal;
      authenticated?: boolean;
      timeoutMs?: number;
      refresh?: boolean;
      params?: Record<string, string>;
      idempotencyKey?: string;
      validate?: (data: Success<Operation<P, M>>) => boolean;
    } = {},
  ): Promise<Success<Operation<P, M>>> {
    const controller = new AbortController();
    const started = Date.now();
    let phase: RequestDiagnostic["phase"] = "token";
    let timedOut = false;
    let status = 0;
    let requestId: string | null = null;
    let rejectedByServer = false;
    pending.add(controller);
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    const timer = setTimeout(
      () => {
        timedOut = true;
        abort();
      },
      options.timeoutMs ?? (method === "get" ? 90000 : 45000),
    );
    let sent = false;
    try {
      if (!active || !isCurrentSession())
        throw new ApiError(
          "The account session changed.",
          401,
          "SESSION_CHANGED",
        );
      if (controller.signal.aborted)
        throw new ApiError("Request cancelled or timed out.", 0, "ABORTED");
      let token =
        options.authenticated === false
          ? null
          : await abortable(getToken(options.refresh), controller.signal);
      if (!active || !isCurrentSession())
        throw new ApiError(
          "The account session changed.",
          401,
          "SESSION_CHANGED",
        );
      if (options.authenticated !== false && !token)
        throw new ApiError("Sign in to continue.", 401, "SESSION_REQUIRED");
      if (controller.signal.aborted)
        throw new ApiError("Request cancelled or timed out.", 0, "ABORTED");
      sent = true;
      const query = options.query
        ? "?" +
          new URLSearchParams(
            Object.entries(options.query)
              .filter(([, value]) => value !== undefined && value !== null)
              .map(([key, value]) => [key, String(value)]),
          ).toString()
        : "";
      // A single deadline covers token acquisition, one GET token refresh,
      // HTTP transport and body consumption. No automatic write retries.
      let response: Response;
      let refresh = !!options.refresh;
      while (true) {
        phase = "http";
        response = await abortable(
          transport(
            baseUrl +
              path
                .replace(/^\/api\/v1/, "")
                .replace(/\{([^}]+)\}/g, (_match, key) => {
                  const value = options.params?.[key];
                  if (!value)
                    throw new ApiError(
                      "Missing route parameter.",
                      400,
                      "INVALID_ROUTE",
                    );
                  return encodeURIComponent(value);
                }) +
              query,
            {
              method: method.toUpperCase(),
              signal: controller.signal,
              redirect: "error",
              headers: {
                Accept: "application/json",
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(options.idempotencyKey
                  ? { "Idempotency-Key": options.idempotencyKey }
                  : {}),
              },
              ...(options.body ? { body: JSON.stringify(options.body) } : {}),
            },
          ),
          controller.signal,
        );
        status = response.status;
        requestId = safeRequestId(response.headers.get("x-request-id"));
        if (
          response.status === 401 &&
          method === "get" &&
          !refresh &&
          options.authenticated !== false
        ) {
          refresh = true;
          phase = "token";
          token = await abortable(
            getToken(true, token ?? undefined),
            controller.signal,
          );
          if (!active || !isCurrentSession())
            throw new ApiError(
              "The account session changed.",
              401,
              "SESSION_CHANGED",
            );
          if (!token)
            throw new ApiError("Sign in to continue.", 401, "SESSION_REQUIRED");
          continue;
        }
        break;
      }
      phase = "response";
      if (!response.ok) {
        const data = await abortable(response.json(), controller.signal).catch(
          (error) => {
            if (controller.signal.aborted) throw error;
            return null;
          },
        );
        const code = safeServerCode(data?.error?.code, response.status);
        rejectedByServer =
          response.status === 401 ||
          (response.status === 403 && code === "ACCOUNT_DISABLED");
        throw new ApiError("Request failed.", response.status, code, requestId);
      }
      if (response.status === 204) return undefined as Success<Operation<P, M>>;
      try {
        const data: unknown = await abortable(
          response.json(),
          controller.signal,
        );
        // JSON null is a documented success for an unrecorded activity day.
        // Apply shape checks only where the caller knows the endpoint schema.
        if (
          options.validate &&
          !options.validate(data as Success<Operation<P, M>>)
        )
          throw new Error();
        return data as Success<Operation<P, M>>;
      } catch (error) {
        if (controller.signal.aborted) throw error;
        throw new ApiError(
          "Invalid API response.",
          status,
          "INVALID_RESPONSE",
          requestId,
          sent && method !== "get",
        );
      }
    } catch (error) {
      const failure = controller.signal.aborted
        ? new ApiError(
            "Request cancelled or timed out.",
            status,
            timedOut
              ? phase === "token"
                ? "TOKEN_TIMEOUT"
                : "TIMEOUT"
              : "ABORTED",
            requestId,
            sent && method !== "get",
          )
        : error instanceof ApiError
          ? error
          : new ApiError(
              "Request failed.",
              status,
              phase === "token" ? "TOKEN_UNAVAILABLE" : "NETWORK_ERROR",
              requestId,
              sent && method !== "get",
            );
      failure.diagnostic = {
        method: method.toUpperCase(),
        route: safeRoute(path),
        phase,
        durationMs: Date.now() - started,
      };
      if (
        active &&
        isCurrentSession() &&
        options.authenticated !== false &&
        rejectedByServer
      )
        onAuthRejected(failure);
      throw failure;
    } finally {
      clearTimeout(timer);
      pending.delete(controller);
      options.signal?.removeEventListener("abort", abort);
    }
  }
  return {
    request,
    resume: () => {
      active = true;
    },
    pause: () => {
      active = false;
    },
    cancelAll: () => pending.forEach((controller) => controller.abort()),
  };
}
export type ApiClient = ReturnType<typeof createApiClient>;
