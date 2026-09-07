#!/usr/bin/env node
/**
 * Design-DNA audit (manual tool, not a CI gate).
 * Loads every dashboard screen and verifies the ticket-master DNA is live:
 *   - primary token resolves to the oklch orange (not a legacy hex/teal)
 *   - h1 uses Mada (display font), body uses Cairo
 *   - rtl/ar document, rounded-* token classes present, no hex backgrounds
 * Requires the dev stack (web :3000 + backend) and e2e fixtures:
 *   pnpm e2e:setup && node scripts/design-audit.mjs
 */
import { chromium } from "@playwright/test";

const OWNER = { email: "e2e-owner@ticketty.local", password: "E2eTest-Passw0rd-2026" };

const BASE = "http://localhost:3000";
const screens = [
  ["/dashboard", "لوحة التحكم"],
  ["/pos", "نقطة البيع"],
  ["/bookings", "الحجوزات"],
  ["/trips", "الرحلات"],
  ["/buses", "الأسطول"],
  ["/agents", "الوكلاء"],
  ["/financial", "المالية"],
  ["/accounting", "دفتر الأستاذ"],
  ["/manifests", "المنافست"],
  ["/boarding", "بوابة الصعود"],
  ["/settings", "الإعدادات"],
  ["/", "الدخول"],
];

// The DNA tokens every screen must resolve through.
const TOKENS = {
  primary: "var(--primary)", // orange oklch(0.72 0.19 50)
  radius: "var(--radius)", // 1rem
  sans: "var(--font-sans)", // Cairo
  display: "var(--font-display)", // Mada
};

const b = await chromium.launch();
const ctx = await b.newContext({ locale: "ar-EG" });
const p = await ctx.newPage();

// login once (owner storageState equivalent)
await p.goto(BASE + "/");
await p.fill("#email", OWNER.email);
await p.fill("#password", OWNER.password);
await p.click('button[type="submit"]');
await p.waitForURL("**/dashboard", { timeout: 30_000 });

for (const [path, name] of screens) {
  await p.goto(BASE + path);
  await p.waitForTimeout(2500);
  const audit = await p.evaluate(() => {
    const cs = getComputedStyle(document.body);
    const root = getComputedStyle(document.documentElement);
    const h = document.querySelector("h1");
    const btns = [...document.querySelectorAll("button")].slice(0, 5);
    const cards = document.querySelectorAll("[class*='rounded-']");
    const primary = root.getPropertyValue("--primary").trim();
    const radius = root.getPropertyValue("--radius").trim();
    const sans = cs.fontFamily.split(",")[0].trim();
    const h1Font = h ? getComputedStyle(h).fontFamily.split(",")[0].trim() : "-";
    const btnRadius = btns.length
      ? getComputedStyle(btns.find((x) => x.className.includes("gradient")) || btns[0]).borderRadius
      : "-";
    const hexButtons = btns.filter(
      (x) => /^#[0-9a-f]{3,8}$/i.test(getComputedStyle(x).backgroundColor),
    ).length;
    return {
      primary,
      radius,
      sans,
      h1Font,
      btnRadius,
      roundedCount: cards.length,
      hexButtons,
      dir: document.documentElement.dir,
      lang: document.documentElement.lang,
    };
  });
  console.log(
    `${name.padEnd(12)} | primary=${audit.primary.slice(0, 24).padEnd(24)} | h1=${audit.h1Font.padEnd(6)} | body=${audit.sans.padEnd(6)} | dir=${audit.dir}/${audit.lang} | rounded=${audit.roundedCount} | hexBtn=${audit.hexButtons}`,
  );
}
await b.close();
