"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Armchair, Circle, Loader2 } from "lucide-react";
import { cn, formatMoney } from "@/lib/utils";
import { useSession } from "@/components/layout/session-context";
import type { TripSeat } from "@/features/bookings/types";

/** عجلة القيادة — أيقونة مخصصة (النسخة الحالية من lucide لا توفرها). */
function SteeringWheel({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 15v6M3.5 10.5 12 13l8.5-2.5" />
    </svg>
  );
}

/**
 * لغة المقاعد الموحّدة في كل النظام (نطاق UX-7).
 * نفس المكوّن يُستخدم في: الحجوزات، POS، التذاكر — تصميم واحد،
 * حالات واضحة نصًا ولونًا وأيقونة (لا لون فقط)، Legend مدمج.
 *
 * الحالات (يقررها الخادم دائمًا):
 *   متاح        — outline هادئ، تفاعلي
 *   محدد حاليًا — primary متوهج
 *   محجوز لك    — تحذيري نابض (جلسة الكاشير الحالية)
 *   محجوز لغيرك — معطّل باهت
 *   مبيع        — معطّل بلون مرفوض
 *   غير متاح    — مقطوع (سائق/معطّل)
 */

export type SeatVisual =
  | "available"
  | "selected"
  | "held-me"
  | "held-other"
  | "booked"
  | "blocked";

export function seatVisual(
  seat: TripSeat,
  selected: boolean,
  currentUserId: string,
): SeatVisual {
  if (seat.status === "BOOKED") return "booked";
  if (seat.status === "BLOCKED") return "blocked";
  if (seat.status === "HELD") {
    return seat.heldByUserId === currentUserId ? "held-me" : "held-other";
  }
  if (seat.status === "AVAILABLE" && selected) return "selected";
  return "available";
}

export const SEAT_VISUAL_CLS: Record<SeatVisual, string> = {
  available:
    "border-border bg-card text-foreground hover:border-primary hover:bg-primary-soft",
  selected:
    "border-primary bg-gradient-primary text-primary-foreground shadow-glow",
  "held-me": "border-warning bg-warning/15 text-warning-foreground animate-pulse",
  "held-other":
    "border-border/60 bg-muted text-muted-foreground/70 cursor-not-allowed",
  booked:
    "border-destructive/30 bg-destructive/10 text-destructive cursor-not-allowed",
  blocked:
    "border-border/40 bg-muted/40 text-muted-foreground/50 cursor-not-allowed",
};

/** علامات نصية إضافية — لا لون فقط (قاعدة إمكانية الوصول). */
export const SEAT_STATE_MARK: Record<SeatVisual, string> = {
  available: "",
  selected: "✓",
  "held-me": "⏳",
  "held-other": "×",
  booked: "×",
  blocked: "—",
};

export const SEAT_STATE_LABEL: Record<SeatVisual, string> = {
  available: "متاح",
  selected: "محدد حاليًا",
  "held-me": "محجوز لك مؤقتًا",
  "held-other": "محجوز لغيرك",
  booked: "مبيع",
  blocked: "غير متاح",
};

/** دليل الحالات الموحّد — يظهر مع كل خريطة مقاعد. */
export function SeatLegend({ compact = false }: { compact?: boolean }) {
  const items: SeatVisual[] = compact
    ? ["available", "selected", "held-me", "held-other", "booked"]
    : ["available", "selected", "held-me", "held-other", "booked", "blocked"];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold text-muted-foreground">
      {items.map((v) => (
        <span key={v} className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              "inline-block h-4 w-4 rounded-md border-2 text-center text-[8px] leading-[11px]",
              SEAT_VISUAL_CLS[v],
            )}
            aria-hidden="true"
          >
            {SEAT_STATE_MARK[v]}
          </span>
          {SEAT_STATE_LABEL[v]}
        </span>
      ))}
    </div>
  );
}

/**
 * رقم المقعد الرسمي: أرقام فقط. مشتق من موضع المقعد داخل الحافلة —
 * نفس الترتيب في الخادم (fleet/seat-templates.service) حتى لو وصلت
 * بيانات قديمة بحروف أعمدة. رقم واحد لكل مقعد: POS والتذكرة
 * والمنفستو تعرض نفس القيمة.
 */
export function seatNumber(
  row: number,
  column: number,
  columnsPerRow: number,
): string {
  return String((row - 1) * columnsPerRow + column);
}

/**
 * خريطة مقاعد حافلة واقعية: هيكل الحافلة (مقدمة، السائق، الباب الأمامي،
 * الممر المركزي، الأبواب الخلفية) مرسوم بحدود الحافلة ونوافذها،
 * والمقاعد داخلها بترقيم رقمي رسمي. تُستخدم في الحجوزات وPOS.
 */
export function UnifiedSeatMap({
  seats,
  rows,
  columnsPerRow,
  aisleAfterColumn,
  selectedSeatIds,
  pendingSeatId,
  disabled,
  onSeatClick,
}: {
  seats: TripSeat[];
  rows: number;
  columnsPerRow: number;
  aisleAfterColumn: number;
  selectedSeatIds: Set<string> | string[];
  pendingSeatId?: string;
  disabled?: boolean;
  onSeatClick: (seat: TripSeat) => void;
}) {
  const user = useSession();
  const mapRef = useRef<HTMLDivElement>(null);
  const [focusedSeat, setFocusedSeat] = useState<string | null>(null);

  // مفتاح لوحة المفاتيح: التنقل بين المقاعد المتاحة بالأسهم + Enter.
  useEffect(() => {
    if (disabled) return;
    function onKeyDown(event: KeyboardEvent) {
      const available = seats.filter(
        (s) => s.status === "AVAILABLE" || s.status === "HELD",
      );
      if (available.length === 0) return;
      const currentIndex = focusedSeat
        ? available.findIndex((s) => s.id === focusedSeat)
        : -1;
      let nextIndex = currentIndex;

      if (event.key === "ArrowDown") nextIndex = Math.min(currentIndex + columnsPerRow + (aisleAfterColumn > 0 ? 1 : 0), available.length - 1);
      else if (event.key === "ArrowUp") nextIndex = Math.max(currentIndex - columnsPerRow - (aisleAfterColumn > 0 ? 1 : 0), 0);
      else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const step = event.key === "ArrowLeft" ? -1 : 1;
        nextIndex = Math.min(Math.max(currentIndex + step, 0), available.length - 1);
      } else if (event.key === "Enter" && focusedSeat) {
        const seat = seats.find((s) => s.id === focusedSeat);
        if (seat) onSeatClick(seat);
        return;
      } else {
        return;
      }
      if (nextIndex !== currentIndex) {
        event.preventDefault();
        setFocusedSeat(available[nextIndex].id);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [seats, focusedSeat, disabled, onSeatClick, columnsPerRow, aisleAfterColumn]);

  const selectedList = useMemo(
    () =>
      selectedSeatIds instanceof Set
        ? Array.from(selectedSeatIds)
        : selectedSeatIds,
    [selectedSeatIds],
  );
  const seatAt = useMemo(
    () => new Map(seats.map((s) => [`${s.row}-${s.column}`, s])),
    [seats],
  );

  const hasAisle = aisleAfterColumn > 0 && aisleAfterColumn < columnsPerRow;
  const gridColumns = columnsPerRow + (hasAisle ? 1 : 0);
  const focusVisual = focusedSeat
    ? seatVisual(
        seats.find((s) => s.id === focusedSeat) ?? seats[0],
        false,
        user.sub,
      )
    : null;
  void focusVisual;

  return (
    <div
      ref={mapRef}
      className="bus-shell mx-auto w-full max-w-xl select-none rounded-[2rem] border-2 border-foreground/15 bg-gradient-to-b from-muted/60 to-card p-4 shadow-elevated sm:p-5"
      role="group"
      aria-label="خريطة مقاعد الحافلة"
    >
      {/* ── مقدمة الحافلة: السائق + الباب الأمامي ─────────── */}
      <div className="mb-4 flex items-stretch justify-between gap-3">
        {/* مقعد السائق — يسار المقدمة */}
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-muted/50 px-3 py-2">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground"
            aria-label="مقعد السائق — غير متاح للحجز"
            role="img"
          >
            <SteeringWheel className="h-5 w-5" />
          </span>
          <span className="text-[9px] font-bold text-muted-foreground">السائق</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center">
          <p className="font-display text-xs font-extrabold text-foreground/70">
            مقدمة الحافلة
          </p>
          <p className="text-[9px] text-muted-foreground">
            اتجاه السير ←
          </p>
        </div>
        {/* الباب الأمامي — يمين المقدمة */}
        <div
          className="bus-door flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-primary/40 bg-primary-soft/40 px-3 py-2"
          aria-label="الباب الأمامي — مدخل الركاب"
          role="img"
        >
          <span className="text-lg leading-none text-primary">🚪</span>
          <span className="text-[9px] font-bold text-primary">الباب الأمامي</span>
        </div>
      </div>

      {/* ── جسم المقصورة: نوافذ + مقاعد بممر مركزي ────────── */}
      <div className="bus-cabin relative rounded-2xl border-x-4 border-foreground/10 bg-card px-2 py-4 sm:px-3">
        {/* خطوط النوافذ على جانبي المقصورة */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-2 start-0 w-1.5 rounded-full bg-primary/10"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-2 end-0 w-1.5 rounded-full bg-primary/10"
        />

        <div
          className="grid gap-1.5 sm:gap-2"
          style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: rows }).flatMap((_, rowIndex) => {
            const row = rowIndex + 1;
            const cells = [];
            for (let column = 1; column <= columnsPerRow; column += 1) {
              const seat = seatAt.get(`${row}-${column}`);
              const number = seatNumber(row, column, columnsPerRow);
              if (seat) {
                const selected = selectedList.includes(seat.id);
                const v = seatVisual(seat, selected, user.sub);
                const pending = pendingSeatId === seat.id;
                const stub =
                  seat.seatType === "BLOCKED" || seat.seatType === "DRIVER";
                const focused = focusedSeat === seat.id;
                cells.push(
                  <button
                    key={seat.id}
                    type="button"
                    aria-label={`المقعد ${number} — ${SEAT_STATE_LABEL[v]}${seat.seatType === "VIP" ? " (VIP)" : ""}، الأجرة ${formatMoney(seat.price)}`}
                    aria-pressed={selected}
                    data-seat-number={number}
                    data-seat-state={v}
                    disabled={
                      disabled ||
                      pending ||
                      stub ||
                      v === "booked" ||
                      v === "held-other" ||
                      v === "blocked"
                    }
                    onClick={() => onSeatClick(seat)}
                    onFocus={() => setFocusedSeat(seat.id)}
                    title={`المقعد ${number} · ${SEAT_STATE_LABEL[v]} · ${formatMoney(seat.price)}`}
                    className={cn(
                      "bus-seat relative flex h-14 min-w-0 flex-col items-center justify-center rounded-xl border-2 text-xs font-extrabold tabular-nums transition-all duration-200 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                      SEAT_VISUAL_CLS[v],
                      v === "selected" && "scale-105",
                      focused && "ring-3 ring-ring/40",
                    )}
                    dir="ltr"
                  >
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <span className="leading-none">{number}</span>
                        {SEAT_STATE_MARK[v] ? (
                          <span
                            className="absolute -end-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-border bg-card text-[8px] font-black leading-none text-foreground"
                            aria-hidden="true"
                          >
                            {SEAT_STATE_MARK[v]}
                          </span>
                        ) : null}
                      </>
                    )}
                    {seat.seatType === "VIP" && !pending ? (
                      <span className="text-[7px] font-extrabold tracking-wider opacity-80">VIP</span>
                    ) : null}
                  </button>,
                );
              } else {
                // فتحة في هذه الخلية (باب/مساحة) — نعرضها كمساحة فارغة
                cells.push(
                  <div
                    key={`empty-${row}-${column}`}
                    aria-hidden="true"
                    className="h-14 rounded-xl border border-dashed border-border/40"
                  />,
                );
              }
              // الممر المركزي بعد العمود المحدد
              if (column === aisleAfterColumn && hasAisle) {
                cells.push(
                  <div
                    key={`aisle-${row}`}
                    aria-hidden="true"
                    className="flex items-center justify-center"
                  >
                    <span className="bus-aisle-dot inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                  </div>,
                );
              }
            }
            return cells;
          })}
        </div>
      </div>

      {/* ── مؤخرة الحافلة: الباب الخلفي + إشارة الخلف ─────── */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <div
          className="flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border bg-muted/40 px-3 py-2"
          aria-label="باب الطوارئ الخلفي"
          role="img"
        >
          <span className="text-base leading-none text-muted-foreground">🚪</span>
          <span className="text-[9px] font-bold text-muted-foreground">الخلفي</span>
        </div>
        <div className="flex flex-1 items-center justify-end gap-1.5 pe-2">
          <span className="text-[9px] font-bold text-muted-foreground">مؤخرة الحافلة</span>
          <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-muted" aria-hidden="true">
            <Circle className="h-2.5 w-2.5 text-muted-foreground" />
          </span>
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <SeatLegend />
      </div>
    </div>
  );
}

/** أيقونة مقعد للعرض العام (نصوص/تذاكر فارغة). */
export function SeatIcon({ className }: { className?: string }) {
  return <Armchair className={className} />;
}
