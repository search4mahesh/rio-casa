import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["__tests__/setup.ts"],
    // 85 files run in parallel forks, and on Windows that starves individual
    // workers badly enough that a component's mount-and-effect can take longer
    // than testing-library's 1s default `waitFor` window — which surfaces as
    // "Unable to find role=..." on a test that passes every time it is run
    // alone (B-77). The ceiling is only ever paid by a test that is failing:
    // `waitFor` polls and returns the moment its condition holds, so a wider
    // window costs a passing suite nothing.
    //
    // Must stay above `asyncUtilTimeout` in __tests__/setup.ts, or the test
    // times out before the wait does and reports the wrong cause.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: ["node_modules", ".next", "prisma", "__tests__", "*.config.*"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
