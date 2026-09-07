import { defineConfig, devices } from "@playwright/test";

/**
 * Golden-path browser tests (MASTER_PLAN Phase 9).
 * Runs against a real stack: web on :3000 proxying to the backend.
 * Prerequisites (see package.json):
 *   pnpm e2e:setup — provisions test users + a guaranteed future trip
 * Stack: web dev/build on :3000 with its BFF pointing at the backend.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  outputDir: "test-results",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "ar-EG",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/owner.json",
      },
      dependencies: ["setup"],
    },
  ],
});
