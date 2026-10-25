const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
module.exports = defineConfig([
  expoConfig,
  {
    files: ["**/*.test.tsx"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  { ignores: ["dist/*", "android/*", "ios/*"] },
]);
