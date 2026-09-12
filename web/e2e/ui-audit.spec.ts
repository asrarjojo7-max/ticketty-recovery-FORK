import { expect, test, type Page } from "@playwright/test";

const routes = [
  "/dashboard", "/pos", "/bookings", "/boarding", "/trips", "/buses",
  "/agents", "/manifests", "/financial", "/accounting", "/settings", "/profile", "/platform",
];

test("shared controls and headers follow the sizing contract", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("ticketty.tour.v1.OWNER", "done"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/bookings", { waitUntil: "networkidle" });
  const header = page.locator("main header").first();
  await expect(header).toHaveCSS("border-radius", "16px");
  const input = page.locator("main input:visible").first();
  await expect(input).toHaveCSS("height", "44px");
  await expect(input).toHaveCSS("font-size", "16px");
  await expect(input).toHaveCSS("border-radius", "12px");
  const bounds = await header.boundingBox();
  expect(bounds?.x).toBe(16);
  expect(bounds?.width).toBe(358);
});

for (const width of [320, 390]) {
  test(`secondary tabs remain contained at ${width}px in dark mode`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.addInitScript(() => {
      localStorage.setItem("ticketty.tour.v1.OWNER", "done");
      localStorage.setItem("theme", "dark");
    });
    await page.setViewportSize({ width, height: 844 });
    for (const route of ["/buses", "/financial", "/settings", "/accounting"]) {
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.locator("html")).toHaveClass(/dark/);
      const tabs = page.getByRole("tab");
      const count = await tabs.count();
      for (let i = 0; i < count; i++) {
        await tabs.nth(i).click();
        await page.waitForLoadState("networkidle");
        await expectContained(page);
      }
    }
  });
}

async function expectContained(page: Page) {
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    overflowing: [...document.querySelectorAll("main input, main select, main h1, main h2, main [role=tablist]")]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width && rect.height && (rect.left < -1 || rect.right > innerWidth + 1);
      }).map((el) => ({ tag: el.tagName, text: el.textContent?.slice(0, 70) })),
  }));
  expect(metrics.document, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.overflowing).toEqual([]);
}

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`authenticated pages remain contained at ${width}px`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.addInitScript(() => localStorage.setItem("ticketty.tour.v1.OWNER", "done"));
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await test.step(route, async () => {
        await page.goto(route, { waitUntil: "networkidle" });
        await expect(page.locator("main")).toBeVisible();
        await expectContained(page);
      });
    }
  });
}

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`public pages align at ${width}px`, async ({ page, context }) => {
    test.setTimeout(90_000);
    await context.clearCookies();
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/login", "/about", "/privacy", "/terms"]) {
      await test.step(route, async () => {
        await page.goto(route, { waitUntil: "networkidle" });
        await expect(page.locator("h1")).toBeVisible();
        await expectContained(page);
      });
    }
    await page.goto("/login");
    const controls = await page.locator(".login-form input, .login-form button").evaluateAll((els) =>
      els.map((el) => {
        const rect = el.getBoundingClientRect();
        return { left: rect.left, width: rect.width, height: rect.height };
      }),
    );
    expect(controls).toHaveLength(3);
    for (const control of controls) {
      expect(control.height).toBeGreaterThanOrEqual(44);
      expect(Math.abs(control.left - controls[0].left)).toBeLessThan(1);
      expect(Math.abs(control.width - controls[0].width)).toBeLessThan(1);
    }
  });
}
