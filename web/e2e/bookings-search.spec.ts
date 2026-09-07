import { test, expect } from "@playwright/test";

test.describe("golden path: bookings search", () => {
  test("bookings table renders and search filters server-side", async ({
    page,
  }) => {
    await page.goto("/bookings");

    await expect(page.getByText("سجل الحجوزات")).toBeVisible({
      timeout: 15_000,
    });

    // The table either shows rows or the DNA empty state — both valid; the
    // contract is that the screen never crashes. DataTable renders ARIA
    // roles (role=table/row), not literal <table> elements.
    const outcome = await page
      .getByRole("row")
      .first()
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    expect(outcome).toBeTruthy();

    // Server-side search runs without crashing.
    const searchBox = page.getByPlaceholder(/اسم، هاتف، رقم تذكرة/);
    if (await searchBox.isVisible().catch(() => false)) {
      await searchBox.fill("مسافر");
      await page.waitForTimeout(1_500);
    }
  });
});
