/**
 * مولّد باركود Code128 (SVG) + QR — بلا مكتبات إضافية.
 *
 * أنماط Code128-B مأخوذة من مواصفة GS1-128 (نفس جدول zxing
 * Code128Reader.CODE_PATTERNS) — نرمّز توكِن الصعود العاتِم
 * (TB-…) أو رقم التذكرة المطبوع (TK-…). الماسح الحالي في بوابة
 * الصعود (BrowserMultiFormatOneDReader) يقرأ Code128.
 *
 * المخرج SVG خالص (بارات <rect>) — يطبع بحدّة على أي طابعة
 * ويعمل في الطباعة المنفصلة بلا صور خارجية.
 */

// جدول أنماط Code128: 107 أنماط (0-106) — البدء B=104، التوقف=106.
// كل نمط = 6 أرقام (عرض كل عنصر بوحدات الوحدة الواحدة).
const CODE128_PATTERNS: readonly (readonly number[])[] = [
  [2,1,2,2,2,2],[2,2,2,1,2,2],[2,2,2,2,2,1],[1,2,1,2,2,3],[1,2,1,3,2,2],
  [1,3,1,2,2,2],[1,2,2,2,1,3],[1,2,2,3,1,2],[1,3,2,2,1,2],[2,2,1,2,1,3],
  [2,2,1,3,1,2],[2,3,1,2,1,2],[1,1,2,2,3,2],[1,2,2,1,3,2],[1,2,2,2,3,1],
  [1,1,3,2,2,2],[1,2,3,1,2,2],[1,2,3,2,2,1],[2,2,3,2,1,1],[2,2,1,1,3,2],
  [2,2,1,2,3,1],[2,1,3,2,1,2],[2,2,3,1,1,2],[3,1,2,1,3,1],[3,1,1,2,2,2],
  [3,2,1,1,2,2],[3,2,1,2,2,1],[3,1,2,2,1,2],[3,2,2,1,1,2],[3,2,2,2,1,1],
  [2,1,2,1,2,3],[2,1,2,3,2,1],[2,3,2,1,2,1],[1,1,1,3,2,3],[1,3,1,1,2,3],
  [1,3,1,3,2,1],[1,1,2,3,1,3],[1,3,2,1,1,3],[1,3,2,3,1,1],[2,1,1,3,1,3],
  [2,3,1,1,1,3],[2,3,1,3,1,1],[1,1,2,1,3,3],[1,1,2,3,3,1],[1,3,2,1,3,1],
  [1,1,3,1,2,3],[1,1,3,3,2,1],[1,3,3,1,2,1],[3,1,3,1,2,1],[2,1,1,3,3,1],
  [2,3,1,1,3,1],[2,1,3,1,1,3],[2,1,3,3,1,1],[2,1,3,1,3,1],[3,1,1,1,2,3],
  [3,1,1,3,2,1],[3,3,1,1,2,1],[3,1,2,1,1,3],[3,1,2,3,1,1],[3,3,2,1,1,1],
  [3,1,4,1,1,1],[2,2,1,4,1,1],[4,3,1,1,1,1],[1,1,1,2,2,4],[1,1,1,4,2,2],
  [1,2,1,1,2,4],[1,2,1,4,2,1],[1,4,1,1,2,2],[1,4,1,2,2,1],[1,1,2,2,1,4],
  [1,1,2,4,1,2],[1,2,2,1,1,4],[1,2,2,4,1,1],[1,4,2,1,1,2],[1,4,2,2,1,1],
  [2,4,1,2,1,1],[2,2,1,1,1,4],[4,1,3,1,1,1],[2,4,1,1,1,2],[1,3,4,1,1,1],
  [1,1,1,2,4,2],[1,2,1,1,4,2],[1,2,1,2,4,1],[1,1,4,2,1,2],[1,2,4,1,1,2],
  [1,2,4,2,1,1],[4,1,1,2,1,2],[4,2,1,1,1,2],[4,2,1,2,1,1],[2,1,2,1,4,1],
  [2,1,4,1,2,1],[4,1,2,1,2,1],[1,1,1,1,4,3],[1,1,1,3,4,1],[1,3,1,1,4,1],
  [1,1,4,1,1,3],[1,1,4,3,1,1],[4,1,1,1,1,3],[4,1,1,3,1,1],[1,1,3,1,4,1],
  [1,1,4,1,3,1],[3,1,1,1,4,1],[4,1,1,1,3,1],[2,1,1,4,1,2],[2,1,1,2,1,4],
  [2,1,1,2,3,2],[2,3,3,1,1,1,2]
];

const CODE_START_B = 104;
const CODE_STOP = 106;

/** قيمة Code Set B لكل حرف قابل للعرض (0-94). */
function codeBValue(char: string): number {
  const code = char.charCodeAt(0);
  if (code < 32 || code > 126) {
    throw new Error(
      `Code128-B لا يدعم الحرف "${char}" — استخدم رموز ASCII القابلة للعرض فقط`,
    );
  }
  return code - 32;
}

export interface BarcodeSpec {
  /** عرض الوحدة الواحدة (px في viewBox). */
  moduleWidth?: number;
  /** ارتفاع البارات. */
  height?: number;
  /** المنطقة الهادئة (quiet zone) بوحدات. */
  quietZone?: number;
}

/**
 * يرمّز نصًا إلى Code128-B ويعيده كسلسلة SVG <rect> جاهزة للتضمين.
 * تستخدمه التذكرة المطبوعة — الباركود يحمل توكِن الصعود فقط.
 */
export function code128Svg(
  value: string,
  { moduleWidth = 2, height = 56, quietZone = 10 }: BarcodeSpec = {},
): { svg: string; width: number; height: number } {
  const chars = Array.from(value);
  if (chars.length === 0) {
    throw new Error("قيمة الباركود فارغة");
  }

  // البدء B + الأحرف + تحقق المجموع + التوقف
  const codes: number[] = [CODE_START_B];
  let checksum = CODE_START_B;
  chars.forEach((char, index) => {
    const valueCode = codeBValue(char);
    codes.push(valueCode);
    checksum += valueCode * (index + 1);
  });
  codes.push(checksum % 103);
  codes.push(CODE_STOP);

  const bars: string[] = [];
  let x = quietZone;
  let dark = true;
  for (const code of codes) {
    for (const width of CODE128_PATTERNS[code]) {
      if (dark) {
        bars.push(
          `<rect x="${x * moduleWidth}" y="0" width="${width * moduleWidth}" height="${height}" fill="#000"/>`,
        );
      }
      x += width;
      dark = !dark;
    }
    // كل نمط قياسي (6 عناصر) يبدأ أسود وينتهي أبيض — بداية النمط
    // التالي أسود بالتبادل الطبيعي. نمط التوقف (7 عناصر) ينتهي
    // بشريط الإنهاء الأسود العريض — لا شريط إضافي بعده.
  }

  const width = x * moduleWidth;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height + 14}" width="${width}" height="${height + 14}" role="img" aria-label="باركود ${value}">` +
    `<rect width="${width}" height="${height + 14}" fill="#fff"/>` +
    bars.join("") +
    `<text x="${width / 2}" y="${height + 11}" text-anchor="middle" font-family="monospace" font-size="10" fill="#000" letter-spacing="1">${escapeXml(value)}</text>` +
    `</svg>`;

  return { svg, width, height: height + 14 };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * القيمة التي تُرمَّز في باركود التذكرة: توكِن الصعود إن وُجد، وإلا
 * رقم التذكرة (الأرشيف القديم). لا تُرمَّز بيانات الراكب أبدًا —
 * الباركود مفتاح استرجاع فقط والخادم هو مصدر السلطة.
 */
export function barcodeValueFor(ticket: {
  boardingToken?: string | null;
  number: string;
}): string {
  return ticket.boardingToken ?? ticket.number;
}
