"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Armchair, BusFront, Circle, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * مصمم مقاعد الحافلة الواقعي (نطاق UX-6).
 *
 * المستخدم مدير شركة نقل — ليس مهندس مصفوفات. لذلك يرى هنا
 * *باصًا* له مقدمة واضحة واتجاه سير وممر ومقعد سائق وباب خلفي،
 * ويضيف/يحذف الصفوف والمقاعد بالنقر، مع ترقيم تلقائي واقعي
 * (أرقام متسلسلة 1، 2، 3… مشتقة من الموضع) تتحرك مع التعديل.
 * المعاينة حية قبل الحفظ.
 *
 * الناتج هو نفس JSON القالب الموجود (rows/columnsPerRow/aisleAfterColumn
 * + قائمة المقاعد) — لا تغيير في الـ API إطلاقًا.
 */

type SeatKind = "REGULAR" | "VIP" | "BLOCKED";

const KIND_CYCLE: Record<SeatKind, SeatKind> = {
  REGULAR: "VIP",
  VIP: "BLOCKED",
  BLOCKED: "REGULAR",
};

const KIND_CLS: Record<SeatKind, string> = {
  REGULAR: "border-border bg-card text-foreground hover:border-primary hover:bg-primary-soft",
  VIP: "border-accent bg-accent-soft text-accent",
  BLOCKED: "border-border/40 bg-muted/40 text-muted-foreground/40 line-through",
};

const KIND_LABEL: Record<SeatKind, string> = {
  REGULAR: "عادي",
  VIP: "VIP",
  BLOCKED: "غير متاح",
};

/**
 * رقم المقعد الرسمي: أرقام فقط — مشتق من الموضع داخل الحافلة
 * (نفس اشتقاق الخادم). لا حروف أعمدة: الراكب والكاشير وموظف
 * الصعود يقرؤون رقمًا واحدًا بسيطًا.
 */
function seatNumber(row: number, column: number, columnsPerRow: number): number {
  return (row - 1) * columnsPerRow + column;
}

export function SeatTemplateBuilder({
  onSubmit,
  pending,
}: {
  onSubmit: (payload: {
    name: string;
    rows: number;
    columnsPerRow: number;
    aisleAfterColumn: number;
    seats: Array<{ row: number; column: number; seatType: SeatKind; label?: string }>;
  }) => void;
  pending?: boolean;
}) {
  const [name, setName] = useState("");
  const [columnsPerRow, setColumnsPerRow] = useState(4);
  const [aisleAfterColumn, setAisleAfterColumn] = useState(2);
  // الصفوف: مصفوفة حضور — الصف موجود = مقاعده موجودة (بأعمدة مضبوطة)
  const [rowsCount, setRowsCount] = useState(10);
  // مقاعد محذوفة فردية "row:col" (مقعد مخروم من صف موجود — باب/ممر إضافي)
  const [holes, setHoles] = useState<Set<string>>(new Set());
  // أنواع خاصة فقط (الباقي REGULAR)
  const [kinds, setKinds] = useState<Record<string, SeatKind>>({});

  const seatList = useMemo(() => {
    const out: Array<{ row: number; column: number; seatType: SeatKind; label: string }> = [];
    for (let r = 1; r <= rowsCount; r++) {
      for (let c = 1; c <= columnsPerRow; c++) {
        const key = `${r}:${c}`;
        if (holes.has(key)) continue;
        const kind = kinds[key] ?? "REGULAR";
        out.push({ row: r, column: c, seatType: kind, label: String(seatNumber(r, c, columnsPerRow)) });
      }
    }
    return out;
  }, [rowsCount, columnsPerRow, holes, kinds]);

  function toggleSeat(r: number, c: number) {
    const key = `${r}:${c}`;
    // نقرة على مقعد: تدوير النوع عادي→VIP→غير متاح→عادي (تعديل سريع)
    setKinds((k) => {
      const cur = k[key] ?? "REGULAR";
      const next = KIND_CYCLE[cur];
      const copy = { ...k };
      if (next === "REGULAR") delete copy[key];
      else copy[key] = next;
      return copy;
    });
  }

  function removeSeat(r: number, c: number) {
    const key = `${r}:${c}`;
    setHoles((h) => new Set(h).add(key));
  }

  function restoreSeat(r: number, c: number) {
    const key = `${r}:${c}`;
    setHoles((h) => {
      const copy = new Set(h);
      copy.delete(key);
      return copy;
    });
  }

  function addRowAt(index: number) {
    // إدراج صف جديد: الصفوف المعروضة تُرقّم تلقائيًا بالحساب
    setRowsCount((n) => Math.min(50, n + 1));
    void index; // الترقيم الواقعي يشتق دائمًا من row الجديد
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!seatList.length) return;
    onSubmit({
      name: name.trim(),
      rows: rowsCount,
      columnsPerRow,
      aisleAfterColumn,
      seats: seatList,
    });
  }

  const gridColumns = columnsPerRow + (aisleAfterColumn > 0 ? 1 : 0);

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="grid gap-1.5 text-sm font-semibold">
        اسم التخطيط (مثال: «باص 44 مقعدًا — ناقلة شرق»)
        <Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="اكتب اسمًا تعرفه به هذا التخطيط" />
      </label>

      <div className="grid gap-4 rounded-2xl border border-border bg-muted/30 p-4 sm:grid-cols-3">
        <label className="grid gap-1.5 text-xs font-bold">
          عدد الصفوف
          <div className="flex items-center gap-1">
            <Button type="button" size="icon" variant="outline" className="h-11 w-11 sm:h-9 sm:w-9" onClick={() => setRowsCount((n) => Math.max(1, n - 1))} aria-label="صف أقل">−</Button>
            <span className="w-8 text-center font-display text-lg font-bold">{rowsCount}</span>
            <Button type="button" size="icon" variant="outline" className="h-11 w-11 sm:h-9 sm:w-9" onClick={() => addRowAt(rowsCount)} aria-label="صف أكثر"><Plus className="h-4 w-4" /></Button>
          </div>
        </label>
        <label className="grid gap-1.5 text-xs font-bold">
          مقاعد الصف الواحد
          <div className="flex items-center gap-1">
            <Button type="button" size="icon" variant="outline" className="h-11 w-11 sm:h-9 sm:w-9" onClick={() => setColumnsPerRow((n) => Math.max(1, Math.min(10, n - 1)))} aria-label="مقعد أقل">−</Button>
            <span className="w-8 text-center font-display text-lg font-bold">{columnsPerRow}</span>
            <Button type="button" size="icon" variant="outline" className="h-11 w-11 sm:h-9 sm:w-9" onClick={() => setColumnsPerRow((n) => Math.max(1, Math.min(10, n + 1)))} aria-label="مقعد أكثر"><Plus className="h-4 w-4" /></Button>
          </div>
        </label>
        <label className="grid gap-1.5 text-xs font-bold">
          الممر بعد العمود
          <select
            className="h-11 w-full rounded-lg border border-input bg-card px-2 text-base md:h-10 md:text-sm"
            value={aisleAfterColumn}
            onChange={(e) => setAisleAfterColumn(Number(e.target.value))}
          >
            {Array.from({ length: columnsPerRow }).map((_, i) => (
              <option key={i} value={i}>{i === 0 ? "بلا ممر" : `بعد العمود ${i}`}</option>
            ))}
          </select>
        </label>
      </div>

      {/* المعاينة الحية — باص واقعي */}
      <div className="rounded-3xl border-2 border-border bg-gradient-to-b from-muted/50 to-card p-5">
        <p className="mb-2 text-center text-[11px] font-bold text-muted-foreground">
          معاينة حية — كما سيراها الكاشير عند البيع ({seatList.length} مقعدًا)
        </p>

        {/* مقدمة الباص */}
        <div className="mx-auto mb-4 flex w-full max-w-lg items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
          <span className="flex items-center gap-1.5 text-xs font-semibold">
            <BusFront className="h-4 w-4 text-primary" /> مقدمة الحافلة ← اتجاه السير
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-muted" aria-label="مقعد السائق">
            <Circle className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
        </div>

        <div className="w-full overflow-x-auto pb-2">
          <div className="mx-auto grid w-fit gap-2" style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 3rem))` }}>
            {Array.from({ length: rowsCount }).map((_, ri) => {
            const r = ri + 1;
            const cells = [];
            for (let c = 1; c <= columnsPerRow; c++) {
              const key = `${r}:${c}`;
              if (holes.has(key)) {
                cells.push(
                  <button
                    key={key}
                    type="button"
                    onClick={() => restoreSeat(r, c)}
                    title="مقعد محذوف — انقر لاستعادته"
                    className="flex h-11 w-12 items-center justify-center rounded-xl border border-dashed border-border/50 text-[9px] text-muted-foreground/60 hover:border-primary/50"
                    aria-label={`استعادة مقعد الصف ${r} العمود ${c}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>,
                );
              } else {
                const kind = kinds[key] ?? "REGULAR";
                cells.push(
                  <div key={key} className="relative">
                    <button
                      type="button"
                      onClick={() => toggleSeat(r, c)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        removeSeat(r, c);
                      }}
                      title={`مقعد ${seatNumber(r, c, columnsPerRow)} — ${KIND_LABEL[kind]}\nنقرة: تغيير النوع · نقرة يمنى: حذف المقعد`}
                      className={cn(
                        "flex h-11 w-12 flex-col items-center justify-center rounded-xl border text-[10px] font-bold transition",
                        KIND_CLS[kind],
                      )}
                      aria-label={`مقعد رقم ${seatNumber(r, c, columnsPerRow)}، النوع ${KIND_LABEL[kind]}`}
                    >
                      <Armchair className="h-4 w-4" />
                      <span dir="ltr" className="tabular-nums">{seatNumber(r, c, columnsPerRow)}</span>
                    </button>
                  </div>,
                );
              }
              if (c === aisleAfterColumn) {
                cells.push(
                  <div key={`aisle-${r}`} aria-hidden="true" className="flex items-center justify-center text-[10px] text-muted-foreground">
                    {r}
                  </div>,
                );
              }
            }
              return cells;
            })}
          </div>
        </div>

        {/* باب الخلف */}
        <div className="mx-auto mt-3 flex w-full max-w-lg items-center justify-end">
          <span className="rounded-xl border-2 border-dashed border-border bg-card px-3 py-1.5 text-[10px] font-bold text-muted-foreground">
            باب الركاب (الخلف)
          </span>
        </div>

        <div className="mx-auto mt-4 flex max-w-lg flex-wrap items-center justify-center gap-3 border-t border-border pt-3 text-[11px] font-semibold text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-4 w-4 rounded-md border-2 border-border bg-card" /> عادي — نقرة = VIP
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-4 w-4 rounded-md border-2 border-accent bg-accent-soft" /> VIP
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-4 w-4 rounded-md border-2 border-border/40 bg-muted/40" /> غير متاح
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-4 w-4 rounded-md border-2 border-dashed border-border/50" /> محذوف (نقرة يمنى)
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl bg-primary/5 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
        <span className="font-semibold">سيُنشأ التخطيط بـ <strong className="text-primary">{seatList.length}</strong> مقعد قابل للبيع</span>
        <Button type="submit" disabled={pending || !name.trim() || seatList.length === 0}>
          <Plus /> حفظ التخطيط
        </Button>
      </div>
    </form>
  );
}
