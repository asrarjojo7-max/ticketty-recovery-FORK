"use client";

import { Armchair, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TripSeat } from "../types";
import { useSession } from "@/components/layout/session-context";

interface BusSeatMapProps {
  seats: TripSeat[];
  rows: number;
  columnsPerRow: number;
  aisleAfterColumn: number;
  selectedSeatIds: string[];
  pendingSeatId?: string;
  disabled?: boolean;
  onSeatClick: (seat: TripSeat) => void;
}

/**
 * 4-state seat map language (ticket-master DNA):
 *   AVAILABLE     → muted outline, hover = primary tint
 *   HELD_BY_ME     → warning tone (selected by me in this session)
 *   HELD_BY_OTHER  → disabled muted crosshatch
 *   BOOKED         → destructive tone, disabled
 * The server decides the state; heldByUserId decides WHO holds it.
 */
export function BusSeatMap({
  seats,
  rows,
  columnsPerRow,
  aisleAfterColumn,
  selectedSeatIds,
  pendingSeatId,
  disabled,
  onSeatClick,
}: BusSeatMapProps) {
  const user = useSession();
  const seatAt = new Map(seats.map((seat) => [`${seat.row}-${seat.column}`, seat]));
  const gridColumns = columnsPerRow + (aisleAfterColumn > 0 ? 1 : 0);

  return (
    <div className="mx-auto w-full max-w-lg rounded-3xl border border-border bg-gradient-to-b from-muted/40 to-card p-5 sm:p-7">
      <div className="mb-5 flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
        <div>
          <span className="text-xs font-semibold text-foreground">مقدمة الحافلة</span>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            اختر مقعدًا من المقاعد المتاحة
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
              const selected = selectedSeatIds.includes(seat.id);
              const heldByMe = seat.status === "HELD" && seat.heldByUserId === user.sub;
              const heldByOther = seat.status === "HELD" && seat.heldByUserId !== user.sub;
              const booked = seat.status === "BOOKED";
              const available = seat.status === "AVAILABLE" && !selected;
              const pending = pendingSeatId === seat.id;
              const stub = seat.seatType === "BLOCKED" || seat.seatType === "DRIVER";
              cells.push(
                <button
                  key={seat.id}
                  type="button"
                  aria-label={`المقعد ${seat.label}، ${selected ? "محدد" : heldByMe ? "محجوز لك" : booked ? "مبيع" : heldByOther ? "محجوز لغيرك" : available ? "متاح" : "غير متاح"}`}
                  aria-pressed={selected}
                  disabled={disabled || pending || stub || booked || heldByOther || !available && !selected && !heldByMe}
                  onClick={() => onSeatClick(seat)}
                  className={cn(
                    "flex h-12 min-w-0 flex-col items-center justify-center rounded-xl border text-[11px] font-bold transition-all duration-200",
                    // 4-state visual language
                    selected && "border-primary bg-gradient-primary text-primary-foreground shadow-glow ring-2 ring-primary/25",
                    !selected && heldByMe && "border-warning bg-warning/15 text-warning-foreground animate-pulse",
                    !selected && booked && "cursor-not-allowed border-destructive/30 bg-destructive/10 text-destructive opacity-80",
                    !selected && heldByOther && "cursor-not-allowed border-border bg-muted text-muted-foreground/70 opacity-70",
                    !selected && stub && "cursor-not-allowed border-border/50 bg-muted/50 text-muted-foreground/50 opacity-60",
                    !selected && available && "border-border bg-card text-foreground shadow-card hover:-translate-y-0.5 hover:border-primary hover:bg-primary-soft",
                  )}
                >
                  {pending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Armchair className="h-5 w-5" />
                  )}
                  <span>{seat.label}</span>
                  {seat.seatType === "VIP" && !pending && (
                    <span className="text-[7px] font-extrabold tracking-wider opacity-80">
                      VIP
                    </span>
                  )}
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

      <div className="mt-5 flex flex-wrap justify-center gap-4 border-t border-border pt-4 text-[11px] text-muted-foreground">
        <Legend className="border-border bg-card" label="متاح" />
        <Legend className="border-primary bg-gradient-primary" label="محدد" />
        <Legend className="border-warning bg-warning/15" label="محجوز لك" />
        <Legend className="border-muted bg-muted" label="محجوز لغيرك" />
        <Legend className="border-destructive/30 bg-destructive/10" label="مبيع" />
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={cn("h-4 w-4 rounded border-2", className)} />
      {label}
    </span>
  );
}
