import { test, expect } from "@playwright/test";

test.describe("golden path: permission denial (AGENT)", () => {
  test("agent cannot see fleet data via direct URL", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: "playwright/.auth/agent.json",
      locale: "ar-EG",
    });
    const page = await ctx.newPage();

    // Direct navigation to an admin screen — sidebar hides it, but the route
    // must not leak data either (backend guards the API).
    await page.goto("/buses");
    await page.waitForLoadState("networkidle");

    // No bus plate numbers may leak to this role.
    const plateCount = await page
      .locator("h2")
      .filter({ hasText: /^[A-Z0-9-]{4,}$/ })
      .count();
    expect(plateCount).toBe(0);
    await ctx.close();
  });
});
