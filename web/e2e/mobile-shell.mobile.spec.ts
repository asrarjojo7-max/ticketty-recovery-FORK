import { test, expect } from "@playwright/test";

/**
 * تجربة الهاتف المحمول (Pixel 7 / iPhone 13) للواجهة العامة.
 * يتحقق من التنقل السفلي حسب الدور، وملكية POS للحافة السفلية،
 * وحقول السلة الجاهزة للإصبع (>= 44px)، وعدم تكدس عناصر ثابتة.
 */

test.beforeEach(async ({ page }) => {
  // في وضع dev يعيد nextjs-portal حقن نفسه باستمرار فوق الصفحة ويعترض
  // النقرات؛ نراقب DOM ونزيله فور ظهوره في كل الصفحات.
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

test("التنقل السفلي يظهر على الهاتف وتشير الصفحة الحالية", async ({ page }) => {
  await page.goto("/dashboard");
  const nav = page.getByRole("navigation", { name: "اختصارات الهاتف" });
  await expect(nav).toBeVisible();
  const active = nav.locator('[aria-current="page"]');
  await expect(active).toHaveCount(1);
  await expect(active).toContainText("لوحة التحكم");
  // الجانبية الكاملة مخفية على الهاتف قبل فتحها
  await expect(page.locator("#app-sidebar")).toBeHidden();
});

test("زر المزيد يفتح القائمة الجانبية الكاملة", async ({ page }) => {
  await page.goto("/dashboard");
  const sidebar = page.locator("#app-sidebar");
  await expect(sidebar).toBeHidden();
  await page.getByRole("button", { name: "المزيد" }).tap();
  await expect(sidebar).toBeVisible();
});

test("التنقل السفلي يتنقل بين الأقسام", async ({ page }) => {
  await page.goto("/dashboard");
  const nav = page.getByRole("navigation", { name: "اختصارات الهاتف" });
  await nav.getByRole("link", { name: "الحجوزات والتذاكر" }).first().tap();
  await expect(page).toHaveURL(/\/bookings/);
  await expect(
    nav.locator('[aria-current="page"]'),
  ).toContainText("الحجوزات والتذاكر");
});

test("POS يملك الحافة السفلية بلا تنقل سفلي", async ({ page }) => {
  await page.goto("/pos");
  await expect(
    page.getByRole("navigation", { name: "اختصارات الهاتف" }),
  ).toHaveCount(0);
  const cartBar = page.getByRole("button", { name: /السلة فارغة|اختر مقعدًا/ });
  await expect(cartBar).toBeVisible();
  const viewport = page.viewportSize();
  const box = await cartBar.boundingBox();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(Math.abs(box!.y + box!.height - viewport!.height)).toBeLessThanOrEqual(2);
});

test("بعد اختيار مقعد تفتح سلة الهاتف وحقولها بحجم لمس مريح", async ({ page }) => {
  await page.goto("/pos");
  const tripCard = page.locator("main button", { hasText: "متبقي" }).first();
  await tripCard.waitFor({ state: "visible", timeout: 20_000 });
  await tripCard.tap();

  const availableSeat = page
    .locator('button[data-seat-state="available"]')
    .first();
  await availableSeat.waitFor({ state: "visible", timeout: 20_000 });
  await availableSeat.tap();

  await page.getByRole("button", { name: /تفاصيل السلة/ }).tap();
  // السلة المكتبية مخفية على الهاتف — نستهدف حقل شريط الهاتف تحديدًا
  const nameField = page
    .getByRole("button", { name: /طي تفاصيل السلة/ })
    .locator("..")
    .getByPlaceholder("اسم الراكب")
    .first();
  await expect(nameField).toBeVisible();
  const box = await nameField.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test("معاينة التذكرة على الهاتف بلا تداخل وزر الإغلاق ظاهر", async ({ page }) => {
  await page.goto("/bookings");
  const open = page.getByRole("button", { name: "عرض وطباعة التذكرة" }).first();
  await expect(open).toBeVisible({ timeout: 20_000 });
  await open.tap();
  await expect(page.getByTestId("ticket-preview-close")).toBeVisible();
  const ticket = page.getByTestId("bus-ticket").first();
  await expect(ticket).toBeVisible();
  const sizes = await ticket.evaluate((element) => ({
    ticketWidth: element.getBoundingClientRect().width,
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(sizes.ticketWidth).toBeLessThanOrEqual(sizes.viewportWidth);
  expect(sizes.documentWidth).toBeLessThanOrEqual(sizes.viewportWidth);
  const rect = (await ticket.boundingBox())!;
  expect(rect.width / rect.height).toBeCloseTo(147 / 70, 2);
  await expect(ticket.locator('[data-ticket-region="bus"]')).toBeVisible();
  const regions = await ticket.locator('[data-ticket-region="body"] > *').evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, right: r.right, height: r.height };
  }));
  for (let i = 1; i < regions.length; i++) {
    expect(regions[i].y).toBeCloseTo(regions[0].y, 1);
    expect(regions[i].x).toBeGreaterThanOrEqual(regions[i - 1].right - .1);
  }
  await page.getByRole("button", { name: "تكبير التذكرة" }).tap();
  await expect.poll(async () => (await ticket.boundingBox())!.width).toBeGreaterThan(rect.width * 1.9);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(sizes.viewportWidth);
  await expect(page.getByTestId("ticket-preview-close")).toBeVisible();
  await page.getByRole("button", { name: "ملاءمة الشاشة" }).tap();
  await expect.poll(async () => (await ticket.boundingBox())!.width).toBeLessThanOrEqual(sizes.viewportWidth);
  await page.getByTestId("ticket-preview-close").tap();
  await expect(page.getByTestId("ticket-preview-dialog")).toHaveCount(0);
});

test("نافذة كاميرا بوابة الصعود كبيرة وواضحة على الهاتف", async ({ page }) => {
  await page.goto("/boarding");
  const frame = page.locator("video");
  await expect(frame).toBeVisible();
  const box = await frame.boundingBox();
  expect(box).not.toBeNull();
  // نافذة عمودية قابلة لمسح باركود كامل، وليست مستطيلًا قصيرًا.
  expect(box!.height).toBeGreaterThanOrEqual(380);
  expect(box!.height).toBeGreaterThan(box!.width);
});

test("زر حجز جديد ظاهر على الهاتف في الهيدر", async ({ page }) => {
  await page.goto("/dashboard");
  const quickBooking = page.getByRole("link", { name: "حجز جديد" });
  await expect(quickBooking).toBeVisible();
  const box = await quickBooking.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44);
});
