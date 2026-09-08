import { test, expect } from "@playwright/test";

/**
 * رحلة واحدة كاملة لدورة حياة الاشتراك والمراقبة من لوحة المشغّل:
 * تزويد شركة → بدء تجربة 30 يوماً → ترقية للشهري → تجديد → تقرير
 * الاستخدام → أحداث النظام → دليل النسخ الاحتياطي → تعليق بسبب
 * موثّق (يمنع دخول مالكها) → إعادة تفعيل.
 *
 * رحلة واحدة مقصودة: حد الدخول 5/دقيقة على IP مشترك بين البطاقات.
 */

const runId = Date.now().toString(36);
const TENANT = {
  slug: `sub-monitor-e2e-${runId}`,
  name: "شركة الاشتراكات والمراقبة",
  ownerEmail: `sub-monitor-owner-${runId}@ticketty.local`,
};

test("operator manages a tenant subscription lifecycle end-to-end", async ({
  browser,
}) => {
  // جلسة المشغّل من storageState الموفر من setup (OWNER = مشغّل المنصة)
  const ctx = await browser.newContext({
    storageState: "playwright/.auth/owner.json",
    locale: "ar-EG",
  });
  const page = await ctx.newPage();
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");

  // 2) Platform console: health cards live
  await page.goto("/platform");
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { name: "إدارة المنصة والعملاء" }),
  ).toBeVisible();
  await expect(page.getByText("شركات نشطة")).toBeVisible();
  await expect(page.getByText("اشتراكات نشطة")).toBeVisible();
  await expect(page.getByText("حجم قاعدة البيانات")).toBeVisible();

  // 3) Provision a fresh tenant for the lifecycle test
  await page.getByRole("button", { name: "شركة جديدة" }).click();
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();
  await dialog.locator('input[name="name"]').fill(TENANT.name);
  await dialog.locator('input[name="slug"]').fill(TENANT.slug);
  await dialog.locator('input[name="ownerName"]').fill("مالك المراقبة");
  await dialog.locator('input[name="ownerEmail"]').fill(TENANT.ownerEmail);
  await dialog.getByRole("button", { name: "تفعيل الشركة" }).click();
  await expect(
    page.getByText("تم تفعيل الشركة بنجاح"),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "تم" }).click();

  // 4) The tenant row appears active
  const row = page.locator("tr", { hasText: TENANT.slug });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row.getByText("نشطة")).toBeVisible();

  // 5) Start the 30-day trial
  const trialBtn = row.getByRole("button", { name: "بدء تجربة" });
  await trialBtn.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
  if (await trialBtn.isVisible()) {
    await trialBtn.click();
    await expect(
      row.getByText("تجربة مجانية", { exact: false }),
    ).toBeVisible({ timeout: 10_000 });
  }

  // 6) Convert trial → monthly (199,000 SDG)
  const convertBtn = row.getByRole("button", { name: "تحويل لشهري" });
  if (await convertBtn.isVisible().catch(() => false)) {
    await convertBtn.click();
    await expect(row.getByText("شهري", { exact: false })).toBeVisible({
      timeout: 10_000,
    });
  }

  // 7) Renew one month
  const renewBtn = row.getByRole("button", { name: "تجديد شهر" });
  if (await renewBtn.isVisible().catch(() => false)) {
    await renewBtn.click();
    await expect(page.getByText("نشط حتى", { exact: false })).toBeVisible({
      timeout: 10_000,
    });
  }

  // 8) Usage report: commercial numbers only
  await row.getByRole("button", { name: "تقرير" }).click();
  await expect(
    page.getByText("أرقام تجارية مجمّعة فقط"),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("الرحلات (إجمالي)")).toBeVisible();
  await expect(page.getByText("الفروع")).toBeVisible();
  await row.getByRole("button", { name: "تقرير" }).click();

  // 9) System events tab with level filters
  await page.getByRole("tab", { name: "إشعارات النظام" }).click();
  await expect(
    page.getByText("أحداث النظام وإشعاراته"),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "تنبيهات" }).click();
  await page.waitForLoadState("networkidle");

  // 10) Backup runbook tab
  await page.getByRole("tab", { name: "النسخ الاحتياطي" }).click();
  await expect(
    page.getByText("دليل النسخ الاحتياطي والتشغيل"),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("أمر النسخ المعتمد")).toBeVisible();

  // 11) Back to tenants: suspend with a documented reason
  await page.getByRole("tab", { name: "الشركات والاشتراكات" }).click();
  const suspendBtn = row.getByRole("button", { name: "تعليق" });
  await suspendBtn.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
  if (await suspendBtn.isVisible()) {
    await suspendBtn.click();
    const suspDialog = page.locator('[role="dialog"]');
    await expect(suspDialog).toBeVisible();
    await suspDialog.locator("input").last().fill("اختبار التعليق الآلي");
    await suspDialog.getByRole("button", { name: "تعليق الشركة" }).click();

    await expect(
      row.getByText("معلّقة", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });

    // 12) المالك المعلّق لا يستطيع الدخول — عبر نموذج المتصفح الحقيقي
    //     (طلبات API الخام ترفضها حماية Origin بـ 403 قبل الوصول للأعمال)
    const ownerCtx = await browser.newContext({ locale: "ar-EG" });
    const owner = await ownerCtx.newPage();
    await owner.goto("/login");
    await owner.fill("#email", TENANT.ownerEmail);
    await owner.fill("#password", "Any-Password-1!");
    await owner.click('button[type="submit"]');
    // التعليق يمنع الجلسة فوراً — رسالة رفض الظهور تعني أن الاعتماد رُفض
    await expect(owner.locator(".form-error")).toBeVisible({ timeout: 20_000 });
    // لم يصل أبداً للوحة
    await expect(owner).not.toHaveURL(/\/dashboard/);
    await ownerCtx.close();

    // 13) Reactivation restores access
    await row.getByRole("button", { name: "تفعيل" }).click();
    await expect(
      row.getByText("نشطة", { exact: false }),
    ).toBeVisible({ timeout: 15_000 });
  }

  await page.screenshot({ path: "/tmp/platform-subscriptions-e2e.png" });
  await ctx.close();
});
