/** Decimal arithmetic is for input/unit conversion only. Nutrition is server-calculated. */
export function decimalText(value: string): string {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(value);
  if (!match) return value;
  const exponent = Number(match[4]);
  const digits = match[2] + (match[3] ?? "");
  if (/^0+$/.test(digits)) return "0";
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 1000) return value;
  const point = match[2].length + exponent;
  const expanded = point <= 0 ? `0.${"0".repeat(-point)}${digits}` : point >= digits.length ? digits + "0".repeat(point - digits.length) : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return (match[1] === "-" ? "-" : "") + expanded;
}
function scaled(value: string) {
  value = decimalText(value);
  if (!/^\d+(\.\d+)?$/.test(value.trim())) throw new Error("Enter a positive decimal number.");
  const [whole, fraction = ""] = value.trim().split(".");
  return { integer: BigInt(whole + fraction), scale: 10n ** BigInt(fraction.length) };
}
function rounded(numerator: bigint, denominator: bigint, places: number) {
  const scale = 10n ** BigInt(places);
  const integer = (numerator * scale * 2n + denominator) / (denominator * 2n);
  const text = integer.toString().padStart(places + 1, "0");
  return places ? `${text.slice(0, -places)}.${text.slice(-places)}` : text;
}
export function decimalInput(text: string, label: string, min: number, max: number, places = 3): string {
  const value = text.trim();
  if (!new RegExp(`^\\d+(\\.\\d{1,${places}})?$`).test(value) || Number(value) < min || Number(value) > max)
    throw new Error(`Enter ${label} between ${min} and ${max}, with at most ${places} decimal places.`);
  return value;
}
export function multiplyDecimal(a: string, b: string, places = 3) {
  const left = scaled(a), right = scaled(b);
  return rounded(left.integer * right.integer, left.scale * right.scale, places);
}
export function kgToLb(value: string) {
  const number = scaled(value);
  return rounded(number.integer * 100000000n, number.scale * 45359237n, 3);
}
export function lbToKg(value: string) {
  const number = scaled(value);
  return rounded(number.integer * 45359237n, number.scale * 100000000n, 3);
}
export function dateOnly(timeZone: string, instant = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const part = (name: string) => parts.find((value) => value.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function shiftDate(date: string, days: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Enter a date as YYYY-MM-DD.");
  const instant = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== date) throw new Error("Enter a valid calendar date.");
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
}
/** An explicit offset avoids ambiguous or nonexistent local times at DST boundaries. */
export function offsetTimestamp(text: string): string {
  const value = text.trim();
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] ?? 0) > 59)
    throw new Error("Enter a timestamp with an explicit offset, such as 2026-10-29T08:30:00+05:30.");
  shiftDate(match[1], 0);
  if (match[5] !== "Z") {
    const [hours, minutes] = match[5].slice(1).split(":").map(Number);
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) throw new Error("Enter a valid UTC offset.");
  }
  if (!Number.isFinite(Date.parse(value))) throw new Error("Enter a valid timestamp.");
  return value;
}
