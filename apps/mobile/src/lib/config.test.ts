import { validatePublicConfig } from "./config";
import { metric } from "./format";
test("missing public configuration is actionable", () => {
  expect(() => validatePublicConfig(undefined, undefined, true)).toThrow(
    "EXPO_PUBLIC",
  );
});
test.each([
  "http://api.example.test/api/v1",
  "https://localhost/api/v1",
  "https://user:password@api.example/api/v1",
  "https://example.test/api/v1?token=bad",
])("standalone rejects unsafe endpoint %s", (value) => {
  expect(() => validatePublicConfig(value, "pk_test_example", false)).toThrow();
});
test("secret keys cannot become publishable configuration", () => {
  expect(() =>
    validatePublicConfig(
      "https://api.example/api/v1",
      "sk_test_private",
      false,
    ),
  ).toThrow();
});
test("development emulator URL is permitted only in development", () => {
  expect(
    validatePublicConfig("http://10.0.2.2:8000/api/v1", "pk_test_example", true)
      .apiUrl,
  ).toContain("10.0.2.2");
});
test("unknown differs from measured zero and Decimal strings retain precision", () => {
  expect(metric(null)).toBe("Not recorded");
  expect(metric("0")).toBe("0");
  expect(metric("25.59200000", "g")).toBe("25.592 g");
});
