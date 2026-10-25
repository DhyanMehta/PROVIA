import { load } from "@expo/env";
load(process.cwd());
if (process.env.EAS_BUILD_PROFILE === "development") {
  console.log(
    "Development client: Metro and local public configuration are required.",
  );
  process.exit(0);
}
try {
  const url = new URL(process.env.EXPO_PUBLIC_API_URL ?? "");
  const key = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  if (
    url.protocol !== "https:" ||
    url.pathname !== "/api/v1" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1\]?)/i.test(
      url.hostname,
    )
  )
    throw new Error();
  if (!/^pk_(test|live)_[A-Za-z0-9_-]+$/.test(key)) throw new Error();
  console.log(
    "Standalone public configuration is present; verify live backend separately.",
  );
} catch {
  console.error(
    "BLOCKED: standalone APK needs a configured public HTTPS /api/v1 URL and Clerk publishable key. No values printed.",
  );
  process.exit(2);
}
