import { test, expect } from "@playwright/test";

test.describe("golden path: login → dashboard", () => {
  test("owner logs in and sees the operations dashboard", async ({ page }) => {
    // storageState carries the authenticated session (see auth.setup.ts).
    await page.goto("/dashboard");

    // Hero band greets the user with the ops-center title.
    // Group H: الترحيب حسب الدور — المالك يرى ترحيب مالك النظام
    await expect(page.getByText("مرحبًا بك", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("مالك النظام").first()).toBeVisible();

    // KPI cards render (revenue KPI from server aggregation).
    await expect(page.getByText("إيرادات اليوم")).toBeVisible();
    await expect(page.getByText("إجمالي الحجوزات")).toBeVisible();

    // Charts sections render.
    await expect(page.getByText("جاهزية الأسطول")).toBeVisible();

    // The sidebar shows the POS entry (permission: bookings.write).
    await expect(
      page.getByRole("link", { name: "نقطة البيع" }).first(),
    ).toBeVisible();
  });

  test("agent is denied the dashboard KPIs and admin navigation", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: "playwright/.auth/agent.json",
      locale: "ar-EG",
    });
    const page = await ctx.newPage();
    await page.goto("/dashboard");

    // AGENT lacks reports.read → must never see the ops KPIs.
    const seesKpis = await page
      .getByText("إيرادات اليوم")
      .count()
      .catch(() => 0);
    if (page.url().includes("/dashboard") && seesKpis > 0) {
      throw new Error("AGENT must not see the operations dashboard KPIs");
    }

    // Sidebar hides admin-only entries.
    await expect(
      page.getByRole("link", { name: "الأسطول والمقاعد" }),
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: "دفتر الأستاذ" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("link", { name: "التقارير المالية" }),
    ).toHaveCount(0);
    await ctx.close();
  });
});
