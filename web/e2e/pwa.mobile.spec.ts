import { test, expect } from "@playwright/test";

/**
 * بيانات تثبيت التطبيق (PWA manifest) ووسوم viewport/الأيقونات.
 * لا يفترض هذا الملف سلوك offline/service-worker — النطاق هنا هو
 * قابلية التثبيت والوسوم الصحيحة فقط.
 */

test("الـ manifest يُخدم بمحتوى عربي RTL صحيح", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  const manifest = await response.json();
  expect(manifest.short_name).toBe("Ticketty");
  expect(manifest.lang).toBe("ar");
  expect(manifest.dir).toBe("rtl");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/dashboard");
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", purpose: "any" }),
      expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
    ]),
  );
});

test("أيقونات الـ manifest كلها PNG صالحة", async ({ request }) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  const manifest = await manifestResponse.json();
  for (const icon of manifest.icons as Array<{ src: string; type: string }>) {
    const iconResponse = await request.get(icon.src);
    expect(iconResponse.status()).toBe(200);
    expect(iconResponse.headers()["content-type"]).toContain("image/png");
  }
});

test("صفحة الدخول تحمل وسوم التثبيت والـ viewport", async ({ page }) => {
  await page.goto("/login");
  const manifestLink = page.locator('link[rel="manifest"]');
  await expect(manifestLink).toHaveCount(1);

  const viewportMeta = await page
    .locator('meta[name="viewport"]')
    .getAttribute("content");
  expect(viewportMeta).toContain("width=device-width");
  expect(viewportMeta).toContain("viewport-fit=cover");

  const themeColors = await page
    .locator('meta[name="theme-color"]')
    .all();
  expect(themeColors.length).toBeGreaterThanOrEqual(1);

  const appleTouchIcon = page.locator('link[rel="apple-touch-icon"]');
  await expect(appleTouchIcon).toHaveCount(1);
});
