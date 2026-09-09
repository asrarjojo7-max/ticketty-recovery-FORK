import { test as setup, expect } from "@playwright/test";
import { OWNER, AGENT } from "./roles";

/**
 * One-time role logins. Saves storageState files reused by every spec,
 * so the whole suite performs exactly TWO logins (backend throttle: 5/min).
 */
const stateDir = "playwright/.auth";

setup("authenticate as owner", async ({ page }) => {
  await page.goto("/login");
  await page.fill("#email", OWNER.email);
  await page.fill("#password", OWNER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
  // الترحيب حسب الدور (Group H) — OWNER يرى ترحيب مالك النظام
  await expect(page.getByText("مرحبًا بك", { exact: false })).toBeVisible();
  // إنهاء الجولة التعريفية قبل حفظ الجلسة — الاختبارات تفحص الشاشات لا الجولة
  const skipTour = page.getByRole("button", { name: "تخطي الكل" });
  if (await skipTour.isVisible().catch(() => false)) {
    await skipTour.click();
  }
  await page.context().storageState({ path: `${stateDir}/owner.json` });
});

setup("authenticate as agent", async ({ browser }) => {
  // AGENT lacks reports.read — /dashboard redirects elsewhere; wait for
  // whichever allowed screen it lands on, then persist the session.
  const ctx = await browser.newContext({ locale: "ar-EG" });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.fill("#email", AGENT.email);
  await page.fill("#password", AGENT.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|bookings|pos|boarding|trips)/, {
    timeout: 30_000,
  });
  const agentSkipTour = page.getByRole("button", { name: "تخطي الكل" });
  if (await agentSkipTour.isVisible().catch(() => false)) {
    await agentSkipTour.click();
  }
  await ctx.storageState({ path: `${stateDir}/agent.json` });
  await ctx.close();
});
