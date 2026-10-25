module.exports = {
  preset: "jest-expo",
  testTimeout: 20000,
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  collectCoverageFrom: ["src/lib/**/*.ts"],
};
