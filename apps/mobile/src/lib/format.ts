export function metric(value: string | number | null | undefined, unit = "") {
  if (value === null || value === undefined) return "Not recorded";
  // Formatting only. Never calculate nutrition targets in the client.
  const text =
    typeof value === "string"
      ? value.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1")
      : String(value);
  return `${text}${unit ? ` ${unit}` : ""}`;
}
