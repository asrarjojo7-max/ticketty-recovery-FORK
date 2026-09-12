import { test, expect } from "@playwright/test";

/**
 * Golden path: مشغّل المنصة يفعّل شركة نقل جديدة من لوحة المنصة،
 * ثم مالكها الجديد يسجّل الدخول فعلياً عبر بوابة الموظفين.
 * يتحقق أيضاً أن مستخدم بلا platform.admin لا يصل للشاشة.
 */

const OPERATOR = {
  email: "e2e-owner@ticketty.local",
  password: "E2eTest-Passw0rd-2026",
};

test("platform operator provisions a new transport company end-to-end", async ({
  browser,
}) => {
  test.setTimeout(240_000); // بابا الدخول قد ينتظران نافذة الثروتل المشتركة عند الحاجة
  const slug = `e2e-company-${Date.now().toString(36)}`;
  const ownerEmail = `${slug}-owner@ticketty.local`;
  const ownerName = "مالك شركة الاختبار";

  // 1) Operator session — from the setup storageState (OWNER = platform
  //    operator; a manual login here would burn the 5/min login throttle
  //    that step 6 (the new owner's login) also needs).
  const operatorCtx = await browser.newContext({
    storageState: "playwright/.auth/owner.json",
    locale: "ar-EG",
  });
  const operator = await operatorCtx.newPage();
  await operator.goto("/dashboard");
  await operator.waitForLoadState("networkidle");

  // 2) Platform page shows the roster + provision modal
  await operator.goto("/platform");
  await operator.waitForLoadState("networkidle");
  await expect(
    operator.getByRole("heading", { name: "إدارة المنصة والعملاء" }),
  ).toBeVisible();
  await operator.getByRole("button", { name: "شركة جديدة" }).click();

  const dialog = operator.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();

  const generatedPassword = await dialog.locator("code").first().textContent();
  expect(generatedPassword).toBeTruthy();
  expect(generatedPassword!.length).toBeGreaterThanOrEqual(12);

  // 3) Fill the provisioning form
  await dialog.locator('input[name="name"]').fill("شركة اختبار المنصة");
  await dialog.locator('input[name="slug"]').fill(slug);
  await dialog.locator('input[name="ownerName"]').fill(ownerName);
  await dialog.locator('input[name="ownerEmail"]').fill(ownerEmail);

  // 4) Provision — the response must never leak the password into a URL
  const requests: { method: string; url: string }[] = [];
  operator.on("request", (r) =>
    requests.push({ method: r.method(), url: r.url() }),
  );
  await dialog.getByRole("button", { name: "تفعيل الشركة" }).click();

  await expect(operator.getByText("تم تفعيل الشركة بنجاح")).toBeVisible({
    timeout: 20_000,
  });

  for (const r of requests) {
    expect(
      decodeURIComponent(r.url).includes(generatedPassword!),
      `credential leaked into URL: ${r.url}`,
    ).toBe(false);
  }

  // 5) The new tenant appears in the live roster
  await operator.getByRole("button", { name: "تم" }).click();
  // بطاقة الهاتف (md:hidden) تسبق الجدول في الـ DOM وتخفي الـ slug —
  // نستهدف أول ظهور «مرئي» فعليًا على سطح المكتب
  await expect(
    operator.getByText(slug).filter({ visible: true }).first(),
  ).toBeVisible({ timeout: 15_000 });

  // 6) The new owner must rotate the generated password before any workspace
  //    route is available. Login throttle is shared, so retry patiently.
  const permanentPassword = "Permanent-Passw0rd-2026!";
  const ownerCtx = await browser.newContext({
    locale: "ar-EG",
    storageState: { cookies: [], origins: [] },
  });
  const owner = await ownerCtx.newPage();
  await owner.goto("/login");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await owner.fill("#email", ownerEmail);
    await owner.fill("#password", generatedPassword!);
    await owner.click('button[type="submit"]');
    const landed = await owner
      .waitForURL("**/change-password", { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (landed) break;
    await owner.waitForTimeout(15_000);
    await owner.goto("/login");
  }

  await owner.goto("/dashboard");
  await expect(owner).toHaveURL(/\/change-password$/);
  await owner.getByLabel("كلمة المرور المؤقتة").fill(generatedPassword!);
  await owner
    .getByLabel("كلمة المرور الجديدة", { exact: true })
    .fill(permanentPassword);
  await owner.getByLabel("تأكيد كلمة المرور الجديدة").fill(permanentPassword);
  await owner
    .getByRole("button", { name: "حفظ كلمة المرور والمتابعة" })
    .click();
  await expect(owner).toHaveURL(/\/login\?passwordChanged=1$/);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await owner.fill("#email", ownerEmail);
    await owner.fill("#password", permanentPassword);
    await owner.click('button[type="submit"]');
    const landed = await owner
      .waitForURL("**/dashboard", { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (landed) break;
    if (attempt === 4) throw new Error("permanent-password login remained throttled");
    await owner.waitForTimeout(15_000);
    await owner.goto("/login");
  }
  await expect(owner.getByRole("heading", { level: 1 })).toContainText(
    ownerName,
  );

  // 7) The new owner must NOT see the platform console in the sidebar
  const sidebarLinks = await owner.locator("aside a").allTextContents();
  expect(
    sidebarLinks.some((t) => t.includes("إدارة المنصة")),
    "tenant owner must not see the platform console",
  ).toBe(false);

  await operatorCtx.close();
  await ownerCtx.close();
});
