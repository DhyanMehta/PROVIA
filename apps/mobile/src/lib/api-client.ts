import type { paths } from "./contracts";

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
      [K in keyof R]: K extends 200 | 201
        ? R[K] extends { content: { "application/json": infer T } }
          ? T
          : never
        : never;
    }[keyof R]
  : never;
type Token = (refresh?: boolean) => Promise<string | null>;

function abortableToken(promise: Promise<string | null>, signal: AbortSignal) {
  return new Promise<string | null>((resolve, reject) => {
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
  ) {
    super(message);
  }
}

export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError))
    return "Something went wrong. Please try again.";
  const messages: Record<number, string> = {
    401: "Your session could not be verified. Sign in again.",
    403: "Complete your Clerk account setup before continuing.",
    404: "This record is unavailable.",
    409: "Your saved data changed. Reload before confirming.",
    422: "Check the values entered. The server could not accept them.",
    429: "Too many requests. Wait before retrying.",
  };
  const text = error.uncertainWrite
    ? "The save result is unknown. Reconnect and reconcile before trying again."
    : (messages[error.status] ??
      (error.status >= 500
        ? "The backend is unavailable. It may be waking up; try again shortly."
        : error.message));
  return text + (error.requestId ? ` Request ID: ${error.requestId}` : "");
}

export function createApiClient(
  baseUrl: string,
  getToken: Token,
  transport: typeof fetch = fetch,
  isCurrentSession: () => boolean = () => true,
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
    } = {},
  ): Promise<Success<Operation<P, M>>> {
    const controller = new AbortController();
    pending.add(controller);
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    const timer = setTimeout(
      abort,
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
      const token =
        options.authenticated === false
          ? null
          : await abortableToken(getToken(options.refresh), controller.signal);
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
      const response = await transport(
        baseUrl + path.replace(/^\/api\/v1/, "") + query,
        {
          method: method.toUpperCase(),
          signal: controller.signal,
          redirect: "error",
          headers: {
            Accept: "application/json",
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        },
      );
      if (
        response.status === 401 &&
        method === "get" &&
        !options.refresh &&
        options.authenticated !== false
      )
        return request(method, path, { ...options, refresh: true });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new ApiError(
          "Request failed.",
          response.status,
          data?.error?.code ?? `HTTP_${response.status}`,
          response.headers.get("x-request-id"),
        );
      }
      if (response.status === 204) return undefined as Success<Operation<P, M>>;
      return (await response.json()) as Success<Operation<P, M>>;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        "Cannot reach the backend. Check your connection and try again.",
        0,
        controller.signal.aborted ? "ABORTED" : "NETWORK_ERROR",
        null,
        sent && method !== "get",
      );
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
