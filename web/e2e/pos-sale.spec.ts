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

    // نجاح + التقاط رقم التذكرة المطبوع (يبدأ بـ TK-YYYY-)
    // التذاكر الجديدة تُعرض في مكون التذكرة الرسمي (bus-ticket)
    await expect(page.getByText("تم إصدار التذاكر بنجاح").first()).toBeVisible({ timeout: 30_000 });
    const ticketNo = await page
      .getByText(/^TK-\d{4}-\d{6}$/)
      .filter({ visible: true })
      .first()
      .textContent();
    expect(ticketNo).toBeTruthy();
    expect(ticketNo).toMatch(/^TK-\d{4}-\d{6}$/);

    // المعاينة تغلق بوضوح ثم يمكن استدعاء نفس التذكرة من سجل الحجوزات
    // (سيناريو فقدان النسخة الورقية وإعادة الطباعة).
    await page.getByRole("button", { name: "إغلاق معاينة التذكرة" }).click();
    await expect(page.getByText("تم إصدار التذاكر بنجاح")).toBeHidden();
    await page.goto("/bookings");
    const bookingSearch = page.getByPlaceholder("اسم، هاتف، رقم تذكرة...");
    await bookingSearch.fill(ticketNo!.trim());
    const reprint = page.getByRole("button", { name: "عرض / طباعة" }).first();
    await expect(reprint).toBeVisible({ timeout: 20_000 });
    await reprint.click();
    await expect(page.getByTestId("bus-ticket")).toBeVisible();
    await expect(
      page.getByText(ticketNo!.trim(), { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();
    await page.emulateMedia({ media: "print" });
    const printedSize = await page.getByTestId("bus-ticket").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    expect(printedSize.width).toBeCloseTo((147 / 25.4) * 96, 0);
    expect(printedSize.height).toBeCloseTo((70 / 25.4) * 96, 0);
    await page.emulateMedia({ media: "screen" });
    await page.getByRole("button", { name: "إغلاق معاينة التذكرة" }).click();

    // ══ بوابة الصعود ══ (أول فتح في dev يجمع الصفحة عند الطلب — مهلة سخية)
    await page.goto("/boarding", { timeout: 60_000 });

    // الإدخال اليدوي برقم التذكرة المطبوع — نفس ما يقرأه الكاشير
    await page.getByPlaceholder(/TK-|TB-/).fill(ticketNo!.trim());
    await page.getByRole("button", { name: "تحقق" }).click();

    // تذكرة صالحة: بيانات المسافر كاملة
    await expect(page.getByText("مسافر الجولة الكاملة")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "✓ تذكرة صالحة" })).toBeVisible();

    // تسجيل الصعود — بعده التذكرة تصبح CHECKED_IN وتظهر حالة الصعود
    await page.getByRole("button", { name: "تأكيد صعود المسافر" }).click();
    // نعيد التحقق برقم التذكرة: الخادم يرجع ALREADY_BOARDED الآن
    await page.getByPlaceholder(/TK-|TB-/).fill(ticketNo!.trim());
    await page.getByRole("button", { name: "تحقق" }).click();
    await expect(page.getByText("تم تسجيل الصعود مسبقًا")).toBeVisible({ timeout: 20_000 });

    // زر الصعود مختفٍ — لا يمكن تسجيل نفس الراكب مرتين
    await expect(page.getByRole("button", { name: "تأكيد صعود المسافر" })).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText("تم تسجيل صعود هذا المسافر")).toBeVisible();
  });

  test("reuses the same sale key when the first successful response is lost", async ({ page }) => {
    const observedKeys: string[] = [];
    let dropFirstResponse = true;
    await page.route(/\/api\/proxy\/bookings$/, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      observedKeys.push(route.request().headers()["idempotency-key"] ?? "");
      if (dropFirstResponse) {
        dropFirstResponse = false;
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        await response.body();
        await route.abort("connectionfailed");
        return;
      }
      await route.continue();
    });

    await page.goto("/pos");
    const tripCard = page
      .locator("button")
      .filter({ hasText: /متبقي \d+ مقعداً/ })
      .first();
    await expect(tripCard).toBeVisible({ timeout: 15_000 });
    await tripCard.click();
    const seat = page.locator("button[aria-label*='متاح']").first();
    await expect(seat).toBeVisible({ timeout: 15_000 });
    await seat.click();
    await page.getByPlaceholder("اسم الراكب").fill("مسافر إعادة الشبكة");
    await page.getByPlaceholder("هاتف الراكب").fill("09990005555");
    await page.getByPlaceholder("رقم الهوية / الجواز (مطلوب)").fill("NID-RETRY-1");

    await page.getByRole("button", { name: "إتمام البيع" }).click();
    await expect(page.getByText("تعذّر إتمام البيع")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "إتمام البيع" }).click();
    await expect(page.getByText("تم إصدار التذاكر بنجاح").first()).toBeVisible({ timeout: 30_000 });

    expect(observedKeys).toHaveLength(2);
    expect(observedKeys[0]).toBeTruthy();
    expect(observedKeys[1]).toBe(observedKeys[0]);
  });
});
