import { expect, test, type Locator } from "@playwright/test";

// Chromium emits uncompressed page dictionaries, so no system PDF utility is needed.
function pageCount(pdf: Buffer) {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
}

async function layout(ticket: Locator) {
  return ticket.evaluate((el) => {
    const root = el.getBoundingClientRect();
    const scale = root.width / (147 * 96 / 25.4);
    return [...el.querySelectorAll<HTMLElement>("[data-ticket-region], [data-ticket-field]")].map((node) => {
      const r = node.getBoundingClientRect();
      return {
        name: node.dataset.ticketRegion ?? node.dataset.ticketField,
        x: (r.left - root.left) / scale, y: (r.top - root.top) / scale,
        width: r.width / scale, height: r.height / scale,
      };
    });
  });
}

test("ticket keeps its physical layout on phone, tablet, zoom and paper", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("ticketty.tour.v1.OWNER", "done"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/bookings");
  await page.getByRole("button", { name: "عرض وطباعة التذكرة" }).first().click();
  const ticket = page.getByTestId("bus-ticket").first();
  await expect(ticket).toBeVisible();
  await expect(ticket.locator('img[alt^="رمز QR"]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const original = await layout(ticket);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => (await ticket.boundingBox())!.width).toBeLessThanOrEqual(width);
    await expect.poll(async () => {
      const current = await layout(ticket);
      return Math.max(...current.flatMap((r, i) => [Math.abs(r.x - original[i].x), Math.abs(r.y - original[i].y), Math.abs(r.width - original[i].width), Math.abs(r.height - original[i].height)]));
    }).toBeLessThan(.15);
    const rect = (await ticket.boundingBox())!;
    expect(rect.width / rect.height).toBeCloseTo(147 / 70, 2);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "تكبير التذكرة" }).click();
  await expect.poll(async () => (await ticket.boundingBox())!.width).toBeGreaterThan(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(page.getByTestId("ticket-preview-close")).toBeVisible();
  await page.emulateMedia({ media: "print" });
  const paper = await layout(ticket);
  for (let i = 0; i < paper.length; i++) {
    for (const key of ["x", "y", "width", "height"] as const) expect(paper[i][key]).toBeCloseTo(original[i][key], 1);
  }
  const bounds = (await ticket.boundingBox())!;
  expect(bounds.width).toBeCloseTo(147 * 96 / 25.4, 1);
  expect(bounds.height).toBeCloseTo(70 * 96 / 25.4, 1);
  const pdf = testInfo.outputPath("ticket.pdf");
  const singlePdf = await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
  expect(pageCount(singlePdf)).toBe(1);
  expect(singlePdf.toString("latin1")).toMatch(/\/MediaBox\s*\[0 0 416\.\d+ 198(?:\.\d+)?\]/);
  await testInfo.attach("ticket-print", { path: pdf, contentType: "application/pdf" });
  // A second physical sheet must produce exactly a second page, not blank overflow pages.
  await page.locator(".ticket-page").first().evaluate((el) => el.after(el.cloneNode(true)));
  const multiple = testInfo.outputPath("two-tickets.pdf");
  expect(pageCount(await page.pdf({ path: multiple, preferCSSPageSize: true, printBackground: true }))).toBe(2);
  await page.locator(".ticket-page").last().evaluate((el) => el.setAttribute("hidden", ""));
  expect(pageCount(await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true }))).toBe(1);
});
