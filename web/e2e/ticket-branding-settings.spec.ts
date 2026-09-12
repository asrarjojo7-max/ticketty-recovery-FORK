import { test, expect } from "@playwright/test";

test("owner can configure persistent ticket branding", async ({ page }) => {
  await page.goto("/settings");

  await expect(page.getByText("هوية التذكرة المطبوعة", { exact: true })).toBeVisible();
  await expect(page.getByLabel("العبارة الدعائية")).toBeVisible();
  await expect(page.getByLabel("زمن الحضور قبل القيام (دقيقة)")).toHaveValue("30");
  await expect(page.getByText(/تُفحص وتُحسّن وتحفظ في قاعدة البيانات/).first()).toBeVisible();
  await expect(page.getByText("صورة الحافلة", { exact: true })).toBeVisible();
  await expect(page.getByText(/رفع الصورة|استبدال/).first()).toBeVisible();
});
