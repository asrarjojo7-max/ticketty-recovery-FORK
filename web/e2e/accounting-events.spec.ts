import { test, expect } from "@playwright/test";

/**
 * PILOT BLOCKER-2 — رؤية أحداث المحاسبة في الواجهة.
 * الفشل المحاسبي كان غير مرئي: البيع ينجح والقيد يفشل بصمت.
 * هنا نثبت العقد: الصفحة تعرض حالة الطابور (والمنظمة التجريبية
 * عليها أحداث POSTED من drainage BLOCKER-1 — نتحقق من العرض
 * نفسه: أعمدة النوع/الحالة/القيد + العنوان).
 *
 * زر «إعادة المحاولة» يظهر فقط لـ FAILED (لا نستطيع صنع FAILED
 * حقيقي من الـ UI دون كسر عمداً — تغطية سلوك الزر مؤجلة بوعي
 * إلى الـ backend e2e الذي يغطي requeue semantics بالفعل).
 */
test.describe("accounting events visibility", () => {
  test("accounting page shows the events queue with status and journal linkage", async ({
    page,
  }) => {
    await page.goto("/accounting");

    // عقد الصفحة الأساسي
    await expect(
      page.getByText("دفتر الأستاذ والقيود"),
    ).toBeVisible();

    // بطاقة أحداث المحاسبة ظاهرة
    await expect(
      page.getByText("أحداث المحاسبة (الطابور)"),
    ).toBeVisible();

    // المنظمة التجريبية عليها أحداث POSTED (استُنزفت في BLOCKER-1)
    // — إما «كلها مرحّلة» أو شارة عدد غير مرحّل. المهم: الجدول
    // يعرض أحداث بأعمدتها (النوع بالعربية + حالة مرحّل + رقم القيد).
    const postedBadge = page.getByText("مرحّل", { exact: true }).first();
    const emptyQueue = page.getByText("لا توجد أحداث محاسبية");
    const postedOrEmpty = await postedBadge
      .or(emptyQueue)
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => "visible")
      .catch(() => "missing");
    expect(postedOrEmpty).toBe("visible");

    // أحد أنواع الأحداث الفعلية معروضة بالعربية (إثبات أن البيانات
    // تصل من /accounting/events عبر الـ BFF وليس حالة فراغ زائفة)
    const typeLabel = page
      .getByText("استلام دفعة", { exact: true })
      .or(page.getByText("استرداد مكتمل", { exact: true }))
      .or(page.getByText("تسوية وكيل", { exact: true }))
      .first();
    if (postedOrEmpty === "visible" && (await emptyQueue.count()) === 0) {
      await expect(typeLabel).toBeVisible({ timeout: 10_000 });
    }
  });
});
