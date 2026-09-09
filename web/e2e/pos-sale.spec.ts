import { test, expect } from "@playwright/test";

/**
 * Golden path الكاملة (نطاق UX-12/20 + UX-21) — في متصفح حقيقي:
 * POS بيع (بهوية ومحطات) → إصدار التذكرة → رقم TKT المطبوع →
 * بوابة الصعود: بحث يدوي برقم التذكرة → تحقق → تسجيل صعود →
 * منع الصعود المزدوج. كل الطلبات عبر الـ BFF الحقيقي.
 */
test.describe("golden path: POS sale + boarding gate", () => {
  test("seller sells with identity+stops; boarding finds the printed ticket and boards once", async ({ page }) => {
    await page.goto("/pos");

    await expect(page.getByText("شاشة البيع السريع")).toBeVisible();

    // رحلة قابلة للبيع (الإعداد يضمن رحلة مستقبلية)
    const tripCard = page
      .locator("button")
      .filter({ hasText: /متبقي \d+ مقعداً/ })
      .first();
    await expect(tripCard).toBeVisible({ timeout: 15_000 });
    await tripCard.click();

    // خريطة المقاعد الموحدة — مقعد متاح أول (المسعر الآن بوحدة SDG)
    const seat = page
      .locator("button[aria-label*='متاح']")
      .first();
    await expect(seat).toBeVisible({ timeout: 15_000 });
    await seat.click();

    // السلة: بيانات المسافر الكاملة (الاسم + الهاتف + الهوية)
    await expect(page.getByText("سلة البيع")).toBeVisible();
    await page.getByPlaceholder("اسم الراكب").fill("مسافر الجولة الكاملة");
    await page.getByPlaceholder("هاتف الراكب").fill("09990004444");
    await page.getByPlaceholder("رقم الهوية / الجواز (مطلوب)").fill("NID-E2E-777");

    // إتمام البيع (نقد — الوضع التجريبي موسوم بوضوح)
    await expect(page.getByText(/نمط تجريبي/)).toBeVisible();
    await page.getByRole("button", { name: "إتمام البيع" }).click();

    // نجاح + التقاط رقم التذكرة المطبوع (يبدأ بـ TKT-)
    await expect(page.getByText("تم إصدار التذاكر بنجاح").first()).toBeVisible({ timeout: 30_000 });
    const ticketNo = await page
      .locator("p", { hasText: /^TKT-/ })
      .first()
      .textContent();
    expect(ticketNo).toBeTruthy();
    expect(ticketNo).toMatch(/^TKT-/);

    // ══ بوابة الصعود ══ (أول فتح في dev يجمع الصفحة عند الطلب — مهلة سخية)
    await page.goto("/boarding", { timeout: 60_000 });

    // الإدخال اليدوي برقم التذكرة المطبوع — نفس ما يقرأه الكاشير
    await page.getByPlaceholder(/TKT/).fill(ticketNo!.trim());
    await page.getByRole("button", { name: "تحقق" }).click();

    // تذكرة صالحة: بيانات المسافر كاملة
    await expect(page.getByText("مسافر الجولة الكاملة")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("تذكرة صالحة")).toBeVisible();

    // تسجيل الصعود — بعده التذكرة تصبح CHECKED_IN وتظهر رسالة الصعود
    await page.getByRole("button", { name: "تأكيد صعود المسافر" }).click();
    // النص المكتمل قد يحمل تشكيلًا مختلفًا بين العروض — نطابق الجزء الثابت
    await expect(
      page.getByRole("heading", { name: /تسجيل الصعود/ }),
    ).toBeVisible({ timeout: 20_000 });

    // محاولة صعود ثانية بنفس التذكرة — مرفوضة برسالة واضحة
    await page.getByPlaceholder(/TKT/).fill(ticketNo!.trim());
    await page.getByRole("button", { name: "تحقق" }).click();
    await expect(
      page.getByRole("heading", { name: /تسجيل الصعود/ }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "تأكيد صعود المسافر" })).toBeHidden();
  });
});
