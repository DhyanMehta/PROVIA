module.exports = {
  preset: "jest-expo",
  // Lucide publishes an actual CJS build; Jest's native export condition otherwise
  // selects .mjs outside the Expo preset transform. Test real icons, not stubs.
  moduleNameMapper: { "^lucide-react-native$": require.resolve("lucide-react-native") },
  testTimeout: 20000,
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  collectCoverageFrom: ["src/lib/**/*.ts"],
};
