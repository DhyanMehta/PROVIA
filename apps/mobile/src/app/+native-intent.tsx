// Only Router's copy of the URL is rewritten. Clerk's WebBrowser listener must
// receive the original callback so its state and PKCE checks still run.
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}) {
  try {
    const url = new URL(path);
    const clerkCallback =
      url.protocol === "clerk:" &&
      url.host === "com.provia.app.hosted-callback" &&
      (url.pathname === "" || url.pathname === "/");
    if (clerkCallback) return initial ? "/" : null;
    if (
      url.protocol === "provia:" &&
      !url.host &&
      (url.pathname === "" || url.pathname === "/")
    )
      return "/";
  } catch {
    // Router also supplies relative paths. Preserve normal route matching.
  }
  return path;
}
