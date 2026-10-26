// Keep valid PROVIA links. No provider callback is used for first-party auth.
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  try {
    const url = new URL(path);
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
