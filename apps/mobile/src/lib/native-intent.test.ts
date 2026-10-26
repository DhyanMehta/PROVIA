import { redirectSystemPath } from "../app/+native-intent";
test.each([true,false])("bare PROVIA link reaches root (initial=%s)", initial => {
 expect(redirectSystemPath({ path:"provia://", initial })).toBe("/");
 expect(redirectSystemPath({ path:"provia:///", initial })).toBe("/");
});
test.each(["provia:///verify-email?token=test-only-one-time-value","provia:///reset-password?token=test-only-one-time-value","/dashboard","provia://dashboard","provia://unknown","other://callback","https://example.test/","malformed"])("retains link for route matching without interpreting authentication: %s", path => {
 expect(redirectSystemPath({path,initial:false})).toBe(path);
});
