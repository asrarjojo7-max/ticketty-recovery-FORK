import { describe, expect, it } from "vitest";
import { barcodeValueFor, code128Svg } from "./barcode";

describe("code128Svg — Code128-B encoder", () => {
  it("encodes a boarding token into SVG with checksum + stop pattern", () => {
    const { svg, width, height } = code128Svg("TB-9F3A2B7C1D8E0F11");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    // نص القيمة يظهر تحت الباركود (نسخة بشرية)
    expect(svg).toContain("TB-9F3A2B7C1D8E0F11");
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    // أبعاد viewBox متطابقة مع العرض/الارتفاع (يمنع تمدد الطباعة)
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
  });

  it("renders the START B pattern exactly (bar,gap,bar,gap,bar,gap geometry)", () => {
    const { svg } = code128Svg("TK-2026-000184");
    // START B = 2,1,1,2,1,4 بالتبادل أسود/أبيض. بوضع moduleWidth=2 وquietZone=10:
    // أول ثلاث بارات سوداء من النمط: 2 وحدات (x=20 w=4)، ثم 1 وحدة
    // (x=26 w=2)، ثم 1 وحدة (x=32 w=2) — بمسافات بيضاء 1،2 بينها.
    const bars = [...svg.matchAll(/<rect x="(\d+)" y="0" width="(\d+)"/g)]
      .map((m) => ({ x: Number(m[1]), w: Number(m[2]) }));
    expect(bars[0]).toEqual({ x: 20, w: 4 }); // 2 وحدات
    expect(bars[1]).toEqual({ x: 26, w: 2 }); // 1 وحدة
    expect(bars[2]).toEqual({ x: 32, w: 2 }); // 1 وحدة
    // المجموعات تتصاعد إيجابيًا فقط (لا تراكب) — شرط باركود سليم
    for (let i = 1; i < bars.length; i += 1) {
      expect(bars[i].x).toBeGreaterThan(bars[i - 1].x + bars[i - 1].w - 1);
    }
  });

  it("produces the same barcode for the same value (deterministic)", () => {
    const first = code128Svg("TB-ABCDEF0123456789").svg;
    const second = code128Svg("TB-ABCDEF0123456789").svg;
    expect(first).toBe(second);
  });

  it("rejects empty values and non-printable ASCII (Code128-B limits)", () => {
    expect(() => code128Svg("")).toThrow();
    expect(() => code128Svg("مقعد")).toThrow(/Code128-B/);
    expect(() => code128Svg("line\nbreak")).toThrow(/Code128-B/);
  });

  it("keeps quiet zones on both sides (scanner requirement)", () => {
    const { svg } = code128Svg("TK-1", { quietZone: 10, moduleWidth: 2 });
    // أول بار أسود يبدأ عند x = quietZone × moduleWidth = 20
    const firstRect = svg.match(/<rect x="(\d+)" y="0" width="(\d+)"/);
    expect(firstRect).not.toBeNull();
    expect(Number(firstRect![1])).toBeGreaterThanOrEqual(20);
  });
});

describe("barcodeValueFor — anti-fraud token selection", () => {
  it("prefers the opaque boarding token over the public ticket number", () => {
    expect(
      barcodeValueFor({
        boardingToken: "TB-9F3A2B7C1D8E0F11",
        number: "TK-2026-000184",
      }),
    ).toBe("TB-9F3A2B7C1D8E0F11");
  });

  it("falls back to the ticket number for legacy tickets without tokens", () => {
    expect(
      barcodeValueFor({ boardingToken: null, number: "TKT-OLD-123" }),
    ).toBe("TKT-OLD-123");
  });
});
