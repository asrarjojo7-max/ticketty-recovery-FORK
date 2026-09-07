import { test, expect } from "@playwright/test";

test.describe("golden path: POS full sale", () => {
  test("seller picks a trip, selects seats, and completes a sale", async ({
    page,
  }) => {
    await page.goto("/pos");

    // PageHeader renders the POS contract.
    await expect(page.getByText("شاشة البيع السريع")).toBeVisible();

    // A sellable trip card exists (setup guarantees a future OPEN trip).
    const tripCard = page
      .locator("button")
      .filter({ hasText: /متبقي \d+ مقعداً/ })
      .first();
    await expect(tripCard).toBeVisible({ timeout: 15_000 });
    await tripCard.click();

    // Seat map appears; pick the first enabled seat (aria-labels are
    // "LABEL — PRICE جنيالسوداني" for available seats).
    const seat = page
      .locator("button:not([disabled])[aria-label*='جنيالسوداني']")
      .first();
    await expect(seat).toBeVisible({ timeout: 15_000 });
    await seat.click();

    // Cart shows the seat with passenger inputs.
    await expect(page.getByText("سلة البيع")).toBeVisible();
    await page.getByPlaceholder("اسم الراكب").fill("مسافر اختبار E2E");
    await page.getByPlaceholder("هاتف الراكب").fill("0999000111");

    // Complete the sale (cash is the default method).
    await page.getByRole("button", { name: "إتمام البيع" }).click();

    // Ticket dialog confirms issuance with the server-computed total.
    await expect(
      page.getByText("تم إصدار التذاكر بنجاح").first(),
    ).toBeVisible({ timeout: 30_000 });
  });
});
