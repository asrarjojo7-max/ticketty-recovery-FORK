"use client";

import { Armchair, Circle, Loader2 } from "lucide-react";
import { cn, formatMoney } from "@/lib/utils";
import { useSession } from "@/components/layout/session-context";
import type { TripSeat } from "@/features/bookings/types";

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
              "inline-block h-4 w-4 rounded-md border-2",
              SEAT_VISUAL_CLS[v],
            )}
            aria-hidden="true"
          />
          {SEAT_STATE_LABEL[v]}
        </span>
      ))}
    </div>
  );
}

/**
 * خريطة مقاعد الحافلة الواقعية الموحّدة: مقدمة الباص، مقعد السائق،
 * الممر، الصفوف — تُستخدم في الحجوزات وPOS بذات اللغة البصرية.
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
  const selectedList =
    selectedSeatIds instanceof Set ? Array.from(selectedSeatIds) : selectedSeatIds;
  const seatAt = new Map(seats.map((s) => [`${s.row}-${s.column}`, s]));
  const gridColumns = columnsPerRow + (aisleAfterColumn > 0 ? 1 : 0);

  return (
    <div className="mx-auto w-full max-w-lg rounded-3xl border border-border bg-gradient-to-b from-muted/40 to-card p-5 sm:p-7">
      {/* مقدمة الحافلة + السائق */}
      <div className="mb-5 flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
        <div>
          <span className="text-xs font-semibold text-foreground">مقدمة الحافلة</span>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            اختر مقعدًا من المتاح
          </p>
        </div>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground"
          aria-label="مقعد السائق"
        >
          <Circle className="h-4 w-4" />
        </div>
      </div>

      <div
        className="grid gap-2.5"
        style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: rows }).flatMap((_, rowIndex) => {
          const row = rowIndex + 1;
          const cells = [];
          for (let column = 1; column <= columnsPerRow; column += 1) {
            const seat = seatAt.get(`${row}-${column}`);
            if (seat) {
              const selected = selectedList.includes(seat.id);
              const v = seatVisual(seat, selected, user.sub);
              const pending = pendingSeatId === seat.id;
              const stub = seat.seatType === "BLOCKED" || seat.seatType === "DRIVER";
              cells.push(
                <button
                  key={seat.id}
                  type="button"
                  aria-label={`المقعد ${seat.label} — ${SEAT_STATE_LABEL[v]}${seat.seatType === "VIP" ? " (VIP)" : ""}، الأجرة ${formatMoney(seat.price)}`}
                  aria-pressed={selected}
                  disabled={disabled || pending || stub || v === "booked" || v === "held-other" || (v === "blocked")}
                  onClick={() => onSeatClick(seat)}
                  title={`${seat.label} · ${SEAT_STATE_LABEL[v]} · ${formatMoney(seat.price)}`}
                  className={cn(
                    "flex h-12 min-w-0 flex-col items-center justify-center rounded-xl border text-[11px] font-bold transition-all duration-200",
                    SEAT_VISUAL_CLS[v],
                    v === "selected" && "scale-105",
                  )}
                  dir="ltr"
                >
                  {pending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Armchair className="h-5 w-5" />
                  )}
                  <span>{seat.label}</span>
                  {seat.seatType === "VIP" && !pending ? (
                    <span className="text-[7px] font-extrabold tracking-wider opacity-80">VIP</span>
                  ) : null}
                </button>,
              );
            } else {
              cells.push(<div key={`empty-${row}-${column}`} />);
            }
            if (column === aisleAfterColumn) {
              cells.push(
                <div
                  key={`aisle-${row}`}
                  aria-hidden="true"
                  className="flex items-center justify-center text-[10px] text-muted-foreground"
                >
                  {row}
                </div>,
              );
            }
          }
          return cells;
        })}
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <SeatLegend />
      </div>
    </div>
  );
}
