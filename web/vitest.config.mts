import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.d.ts"],
      reporter: ["text", "json-summary"],
      thresholds: {
        // Honest whole-source baseline (2026-09-12): 4.33/4.35/2.52/4.97.
        // Raise these monotonically as component/integration coverage expands.
        statements: 4,
        branches: 4,
        functions: 2,
        lines: 4,
      },
    },
  },
});
