export type FailureCategory =
  | "AUTH_REJECTED"
  | "FORBIDDEN"
  | "AUTH_UNAVAILABLE"
  | "TOKEN_UNAVAILABLE"
  | "TOKEN_TIMEOUT"
  | "NETWORK_TIMEOUT"
  | "NETWORK_ERROR"
  | "CANCELLED"
  | "DATABASE_UNAVAILABLE"
  | "BACKEND_UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "REQUEST_REJECTED";

export type RequestDiagnostic = {
  method: string;
  route: string;
  phase: "token" | "http" | "response";
  durationMs: number;
};

export function failureCategory(status: number, code: string): FailureCategory {
  if (code === "TOKEN_TIMEOUT" || code === "TOKEN_UNAVAILABLE") return code;
  if (code === "TIMEOUT") return "NETWORK_TIMEOUT";
  if (code === "ABORTED") return "CANCELLED";
  if (code === "INVALID_RESPONSE") return code;
  if (code === "AUTH_UNAVAILABLE" || code === "DATABASE_UNAVAILABLE")
    return code;
  if (status === 401) return "AUTH_REJECTED";
  if (status === 403) return "FORBIDDEN";
  if (status >= 500) return "BACKEND_UNAVAILABLE";
  if (!status) return "NETWORK_ERROR";
  return "REQUEST_REJECTED";
}

// Never reflect arbitrary server error text, URLs, query values or headers.
export function safeServerCode(value: unknown, status: number) {
  return typeof value === "string" &&
    [
      "AUTH_UNAVAILABLE",
      "DATABASE_UNAVAILABLE",
      "INTERNAL_SERVER_ERROR",
      "RESOURCE_NOT_FOUND",
      "VALIDATION_ERROR",
      "ACCOUNT_DISABLED",
      "EMAIL_NOT_VERIFIED",
      "EMAIL_UNAVAILABLE",
      "INVALID_ACTION",
      "RATE_LIMITED",
      "INVALID_AUTHENTICATION",
    ].includes(value)
    ? value
    : `HTTP_${status}`;
}
export function safeRequestId(value: string | null) {
  return value && /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? value : null;
}
export function safeRoute(path: string) {
  return [
    "/api/v1/me",
    "/api/v1/profile",
    "/api/v1/goals",
    "/api/v1/dashboard/today",
    "/api/v1/health",
    "/api/v1/health/db",
    "/api/v1/nutrition/calculate-maintenance",
    "/api/v1/nutrition/calculate-goals",
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/refresh",
    "/api/v1/auth/logout",
    "/api/v1/auth/logout-all",
    "/api/v1/auth/me",
    "/api/v1/auth/sessions",
    "/api/v1/auth/sessions/{session_id}",
    "/api/v1/auth/verify-email",
    "/api/v1/auth/resend-verification",
    "/api/v1/auth/forgot-password",
    "/api/v1/auth/reset-password",
    "/api/v1/auth/change-password",
  ].includes(path)
    ? path
    : "<api-route>";
}
