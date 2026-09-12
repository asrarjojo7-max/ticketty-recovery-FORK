/**
 * تعريفات محلية مطلوبة فقط لاختبار roundtrip — @zxing/library ليست
 * تبعية مباشرة للواجهة (يصل إليها الاختبار عبر مسار pnpm الخاص
 * بـ @zxing/browser). نصرّح فقط بما يستخدمه الاختبار.
 */

declare module "@zxing/library" {
  export class BitArray {
    constructor(size?: number);
    getSize(): number;
    set(index: number): void;
  }
  export class Result {
    getText(): string;
  }
  export class Code128Reader {
    decodeRow(
      rowNumber: number,
      row: BitArray,
      hints: Map<number, unknown> | null,
    ): Result;
  }
}
