import { dateOnly, decimalInput, decimalText, kgToLb, lbToKg, multiplyDecimal, offsetTimestamp, shiftDate } from "./form-values";
import { metric } from "./format";
test("PostgreSQL numeric exponent strings display and convert exactly without losing tiny recorded values", () => {
  expect(decimalText("0E-8")).toBe("0");
  expect(decimalText("1.25E-8")).toBe("0.0000000125");
  expect(decimalText("-1.25E+3")).toBe("-1250");
  expect(metric("0E-8", "g")).toBe("0 g");
  expect(metric("1E-8", "g")).toBe("0.00000001 g");
  expect(kgToLb("0E-8")).toBe("0.000");
});
test("decimal multiplication rounds HALF_UP without binary floating point", () => {
  expect(multiplyDecimal("0.1", "0.2")).toBe("0.020");
  expect(multiplyDecimal("1.0055", "1")).toBe("1.006");
  expect(multiplyDecimal("37.333", "0.333")).toBe("12.432");
});
test("weight conversions use the exact international pound definition", () => {
  expect(lbToKg("1")).toBe("0.454");
  expect(lbToKg("220.46226218")).toBe("100.000");
  expect(kgToLb("100")).toBe("220.462");
});
test("profile-zone calendar keys remain correct around UTC midnight and DST", () => {
  expect(dateOnly("Asia/Kolkata", new Date("2026-10-28T20:00:00Z"))).toBe("2026-10-29");
  expect(dateOnly("America/New_York", new Date("2026-11-01T03:00:00Z"))).toBe("2026-10-31");
  expect(shiftDate("2024-02-28", 1)).toBe("2024-02-29");
  expect(() => shiftDate("2026-02-29", 1)).toThrow();
});
test.each(["2026-10-29T08:30:00.123456+05:30", "2026-11-01T01:30:00-04:00", "2026-11-01T01:30:00-05:00"])("explicit instants preserve backend precision and DST choice: %s", value => expect(offsetTimestamp(value)).toBe(value));
test.each(["2026-02-30T10:00:00Z", "2026-10-29T24:30:00Z", "2026-10-29T08:30:00+14:01", "2026-10-29T08:30:00", "2026-10-29"])("invalid or ambiguous timestamp rejected: %s", value => expect(() => offsetTimestamp(value)).toThrow());
test("decimal fields enforce bounds and precision, including an explicit zero minimum", () => {
  expect(decimalInput("0", "weight", 0, 100)).toBe("0");
  expect(() => decimalInput("0", "weight", 0.001, 100)).toThrow();
  expect(() => decimalInput("1e2", "weight", 0, 100)).toThrow();
  expect(() => decimalInput("1.0001", "weight", 0, 100)).toThrow();
});
