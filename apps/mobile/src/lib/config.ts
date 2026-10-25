export type PublicConfig = { apiUrl: string; clerkKey: string };

export function validatePublicConfig(
  apiUrl: string | undefined,
  clerkKey: string | undefined,
  development: boolean,
): PublicConfig {
  if (!apiUrl || !clerkKey)
    throw new Error(
      "Set EXPO_PUBLIC_API_URL and EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in apps/mobile/.env.local.",
    );
  const url = new URL(apiUrl);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/api/v1"
  )
    throw new Error(
      "API URL must end in /api/v1 without credentials, query or fragment.",
    );
  if (url.protocol !== "https:" && !(development && url.protocol === "http:"))
    throw new Error("A standalone build requires an HTTPS backend.");
  if (
    !development &&
    /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1\]?)/i.test(
      url.hostname,
    )
  )
    throw new Error("A standalone build cannot use a local backend address.");
  if (!/^pk_(test|live)_[A-Za-z0-9_-]+$/.test(clerkKey))
    throw new Error("Use a Clerk publishable key, never a secret key.");
  return { apiUrl: apiUrl.replace(/\/$/, ""), clerkKey };
}
