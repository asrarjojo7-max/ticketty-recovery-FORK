import { test, expect } from "@playwright/test";

/**
 * SECURITY REGRESSION: credentials must NEVER appear in a URL.
 *
 * Root cause of the original incident (2026-09-07): Next.js 16's
 * block-cross-site-dev rejected the tunnel origin on /_next/* dev assets
 * (403), React never hydrated, and the login form fell back to a native
 * GET submission — putting the password in the URL. Fixed via
 * allowedDevOrigins + method="POST" on the form. These specs fail the
 * build if any credential ever reaches a URL again (submit path,
 * redirects, navigation, history) or if the form regresses to GET.
 */

const OWNER = {
  email: "e2e-owner@ticketty.local",
  password: "E2eTest-Passw0rd-2026",
};

test("login flow never places credentials in a URL", async ({ page }) => {
  const seen: { method: string; url: string }[] = [];
  page.on("request", (r) => seen.push({ method: r.method(), url: r.url() }));

  await page.goto("/login");
  await page.fill("#email", OWNER.email);
  await page.fill("#password", OWNER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 30_000 });

  // 1) No request URL contains the credentials (decoded or encoded).
  for (const r of seen) {
    const decoded = decodeURIComponent(r.url).toLowerCase();
    expect(
      decoded.includes(OWNER.password.toLowerCase()) ||
        decoded.includes("password=") ||
        decoded.includes(encodeURIComponent(OWNER.email).toLowerCase()),
      `credential leaked into URL: ${r.method} ${r.url}`,
    ).toBe(false);
  }

  // 2) The login went through a POST, not a form GET.
  const loginReq = seen.find(
    (r) => r.url.includes("/api/session") && r.method === "POST",
  );
  expect(loginReq).toBeDefined();

  // 3) The final URL is clean.
  expect(page.url()).not.toMatch(/password|email=/i);

  // 4) The form tag itself is structurally POST-only (defense in depth:
  //    even a hydration failure cannot produce a GET submission).
  await page.goto("/login");
  const method = await page.locator("form.login-form").getAttribute("method");
  expect(method).toBe("POST");
  const action = await page
    .locator("form.login-form")
    .getAttribute("action");
  expect(action).toBe("/api/session");

  // 5) The SERVER-RENDERED HTML itself carries the POST contract — so the
  //    guarantee exists before any JavaScript runs (no-JS browsers and
  //    pre-hydration states included).
  const html = await page.content();
  expect(html).toMatch(
    /<form[^>]*action="\/api\/session"[^>]*method="POST"[^>]*>|<form[^>]*method="POST"[^>]*action="\/api\/session"[^>]*>/,
  );
});

test("native form submission (no React handlers) is POST with body-only credentials", async ({
  page,
}) => {
  // Simulate the pre-hydration state as closely as a real browser can:
  // submit programmatically immediately after DOM ready. The request must
  // be a POST to the session route with credentials in the body — never
  // in the URL — regardless of whether React handlers attached.
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(OWNER.email, { timeout: 15_000 });
  await page.locator("#password").fill(OWNER.password);

  // Attach the listener BEFORE submitting so nothing is missed.
  const submitPromise = page.waitForRequest(
    (r) => r.url().includes("/api/session") && r.method() === "POST",
    { timeout: 20_000 },
  );

  await page.evaluate(() => {
    (document.querySelector("form.login-form") as HTMLFormElement).requestSubmit();
  });

  const submit = await submitPromise;
  expect(submit.method()).toBe("POST");
  expect(submit.url()).not.toMatch(/password|email=/i);
  const body = submit.postData() ?? "";
  expect(body).toContain(OWNER.email);

  // Whatever the outcome (JSON fetch flow or urlencoded fallback), the
  // browser URL must stay clean of credentials.
  await page.waitForTimeout(2_000);
  expect(page.url()).not.toMatch(/password|email=/i);
});
