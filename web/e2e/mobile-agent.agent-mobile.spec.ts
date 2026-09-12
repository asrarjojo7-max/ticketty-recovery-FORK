import { test, expect } from "@playwright/test";

/**
 * دور الوكيل على الهاتف: التنقل السفلي يعكس الصلاحيات فقط.
 * لا يرى الوكيل روابط الإدارة (أسطول/محاسبة/مالية) لا في الشريط
 * السفلي ولا في القائمة الجانبية الكاملة.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const purge = () =>
      document
        .querySelectorAll("nextjs-portal")
        .forEach((el) => el.remove());
    purge();
    new MutationObserver(purge).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  });
});

test("وكيل الهاتف يرى وجهات البيع فقط", async ({ page }) => {
  await page.goto("/bookings");
  const nav = page.getByRole("navigation", { name: "اختصارات الهاتف" });
  await expect(nav).toBeVisible();

  const links = nav.locator("a");
  const count = await links.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const label = (await links.nth(i).innerText()).trim();
    expect(
      label,
      `الوكيل لا يجب أن يرى «${label}»`,
    ).not.toMatch(/الأسطول|دفتر الأستاذ|التقارير المالية|إدارة المنصة|الإعدادات/);
  }

  const current = nav.locator('[aria-current="page"]');
  await expect(current).toContainText("الحجوزات والتذاكر");
});

test("القائمة الجانبية للوكيل بلا روابط إدارية", async ({ page }) => {
  await page.goto("/bookings");
  await page.getByRole("button", { name: "المزيد" }).tap();
  const sidebar = page.locator("#app-sidebar");
  await expect(sidebar).toBeVisible();
  await expect(sidebar).not.toContainText("الأسطول والمقاعد");
  await expect(sidebar).not.toContainText("دفتر الأستاذ");
  await expect(sidebar).not.toContainText("التقارير المالية");
});
