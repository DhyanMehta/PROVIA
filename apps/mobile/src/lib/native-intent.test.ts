import { redirectSystemPath } from "../app/+native-intent";

test.each([true, false])(
  "bare PROVIA link reaches the root (initial=%s)",
  (initial) => {
    expect(redirectSystemPath({ path: "provia://", initial })).toBe("/");
    expect(redirectSystemPath({ path: "provia:///", initial })).toBe("/");
  },
);
test("warm Clerk callback does not navigate away from the pending SDK flow", () => {
  expect(
    redirectSystemPath({
      path: "clerk://com.provia.app.hosted-callback?state=private&rotating_token_nonce=private",
      initial: false,
    }),
  ).toBeNull();
});
test("cold callback reaches session hydration without treating callback params as auth", () => {
  expect(
    redirectSystemPath({
      path: "clerk://com.provia.app.hosted-callback?created_session_id=untrusted",
      initial: true,
    }),
  ).toBe("/");
});
test.each([
  "/dashboard",
  "provia://dashboard",
  "provia://unknown",
  "clerk://other-app.hosted-callback",
  "https://example.test/",
  "malformed",
  "clerk://com.provia.app.hosted-callback/other",
])("does not rewrite unrelated link %s", (path) => {
  expect(redirectSystemPath({ path, initial: false })).toBe(path);
});
