import { test, expect } from "@playwright/test";

test.describe("golden path: trips screen", () => {
  test("trips table renders with the PageHeader contract", async ({ page }) => {
    await page.goto("/trips");

    await expect(
      page.getByRole("heading", { name: "الرحلات والمسارات" }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "جدول الرحلات" })).toBeVisible();

    // Tabs switch to routes.
    await page.getByRole("tab", { name: "خطوط السير" }).click();
    await expect(
      page.getByRole("tab", { name: "خطوط السير" }),
    ).toHaveAttribute("aria-selected", "true");
  });
});
