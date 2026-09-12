import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("session security", () => {
  test("an expired browser session cannot reach an authenticated page", async ({
    context,
    page,
  }) => {
    await context.addCookies([
      {
        name: "ticketty_session",
        value: "expired.invalid.token",
        url: "http://localhost:3000",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel("البريد الإلكتروني")).toBeVisible();
  });

  test("an unauthenticated browser cannot use a protected BFF route", async ({
    request,
  }) => {
    const response = await request.get("/api/proxy/auth/me");
    expect(response.status()).toBe(401);
  });
});
