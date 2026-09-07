import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await (await b.newContext({ locale: "ar-EG" })).newPage();
const errors = [];
p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text().slice(0, 180)}`); });
p.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message.slice(0, 180)}`));
await p.goto("http://localhost:3000/", { waitUntil: "networkidle" }).catch(() => {});
await p.waitForTimeout(3000);
const formAttrs = await p.evaluate(() => {
  const f = document.querySelector("form.login-form");
  return f ? { action: f.getAttribute("action"), method: f.getAttribute("method") } : null;
});
console.log("LIVE DOM form:", JSON.stringify(formAttrs));
console.log("\nCONSOLE ISSUES:");
console.log(errors.length ? errors.join("\n") : "none");
await b.close();
