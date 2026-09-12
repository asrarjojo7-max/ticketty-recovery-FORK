import { describe, expect, it } from "vitest";
import { code128Svg } from "./barcode";

/**
 * اختبار دورة كاملة (roundtrip): نرمّز بتوكِن صعود ثم نفكّه بماسح
 * حقيقي (نفس عائلة zxing التي تستخدمها بوابة الصعود) بعد تحويل SVG
 * إلى bitmap ثنائي — يثبت أن الباركود المطبوع قابل للمسح فعلاً.
 *
 * يعمل في Node (بيئة vitest) بلا DOM: نبني مصفوفة البكسل يدويًا من
 * هندسة البارات نفسها بدل مكتبة رسم.
 *
 * ملاحظة: @zxing/library ليست تبعية مباشرة للواجهة (pnpm strict) —
 * نصل إليها عبر مسار pnpm الخاص بـ @zxing/browser نفسها.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
function loadZxing(): typeof import("@zxing/library") {
  // السلسلة: web/node_modules/@zxing/browser → pnpm store → sibling library
  const path = require("node:path") as typeof import("node:path");
  const fs = require("node:fs") as typeof import("node:fs");
  const browserDir = path.dirname(require.resolve("@zxing/browser/package.json"));
  // pnpm يضع التبعيات كأشقّاء داخل نفس مجلد .pnpm — نصعد مستويات
  // ونبحث عن @zxing/library/node_modules (نفس ما يفعله حلّال Node).
  let dir = browserDir;
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = path.join(dir, "node_modules", "@zxing", "library");
    if (fs.existsSync(candidate)) {
      return require(path.join(candidate, "cjs", "index.js"));
    }
    dir = path.dirname(dir);
  }
  throw new Error("لم يُعثر على @zxing/library — مسار pnpm غير متوقع");
}

describe("code128 ↔ zxing roundtrip (scan proof)", () => {
  function decodeWithZxing(value: string): string | null {
    const zxing = loadZxing();
    const { svg } = code128Svg(value, { moduleWidth: 2, height: 40 });
    // استخراج كل البارات السوداء: x وwidth بوحدات الوحدة الواحدة
    const bars = [...svg.matchAll(/<rect x="(\d+)" y="0" width="(\d+)" height="40"/g)]
      .map((m) => ({ x: Number(m[1]) / 2, width: Number(m[2]) / 2 }))
      .sort((a, b) => a.x - b.x);

    // بناء صف البكسل: أسود حيث يوجد بار
    const maxX = Math.max(...bars.map((b) => b.x + b.width)) + 10;
    const row = new Uint8ClampedArray(maxX).fill(255);
    for (const bar of bars) {
      for (let i = bar.x; i < bar.x + bar.width; i += 1) {
        row[i] = 0;
      }
    }

    const reader = new zxing.Code128Reader();
    const bits = new zxing.BitArray(maxX);
    for (let i = 0; i < maxX; i += 1) {
      if (row[i] === 0) bits.set(i);
    }
    try {
      const result = reader.decodeRow(0, bits, null);
      return result.getText();
    } catch {
      return null;
    }
  }

  it("scans back to the exact boarding token with the real decoder", () => {
    const token = "TB-9F3A2B7C1D8E0F11";
    expect(decodeWithZxing(token)).toBe(token);
  });

  it("scans a printed ticket number too", () => {
    const number = "TK-2026-000184";
    expect(decodeWithZxing(number)).toBe(number);
  });

  it("scans multiple random tokens (robustness across values)", () => {
    const tokens = [
      "TB-0123456789ABCDEF",
      "TB-FFFFFFFFFFFFFFFF",
      "TK-2026-000001",
      "TKT-MTUDBYBZ-DC3466",
    ];
    for (const token of tokens) {
      expect(decodeWithZxing(token)).toBe(token);
    }
  });
});
