"use client";

import { useState } from "react";
import { Armchair } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeletons";
import type { TripSeat, TripSeatsResponse } from "@/features/bookings";
import type { SessionUser } from "@/types";

/**
 * 4-state seat map language (ticket-master DNA + golden rule: the server is
 * the source of truth — heldByUserId decides whose hold it is):
 *   AVAILABLE  → selected = gradient-primary; unselected = muted outline
 *   HELD_BY_ME  → warning tone with pulse + countdown feel
 *   HELD_BY_OTHER → muted, disabled, crosshatch
 *   BOOKED     → destructive tone, disabled
 * Driver/blocked seats are rendered as a stub.
 */

type SeatVisual = "available" | "selected" | "held-me" | "held-other" | "booked" | "blocked";

function seatVisual(
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

const visualCls: Record<SeatVisual, string> = {
  available:
    "border-border bg-card text-foreground hover:border-primary hover:bg-primary-soft",
  selected:
    "border-primary bg-gradient-primary text-primary-foreground shadow-glow scale-105",
  "held-me":
    "border-warning bg-warning/15 text-warning-foreground animate-pulse",
  "held-other": "border-border/60 bg-muted text-muted-foreground cursor-not-allowed",
  booked: "border-destructive/30 bg-destructive/10 text-destructive cursor-not-allowed",
  blocked: "border-border/40 bg-muted/40 text-muted-foreground/50 cursor-not-allowed",
};

export function SeatPanel({
  data,
  isLoading,
  isError,
  currentUser,
  selectedSeatIds,
  onToggleSeat,
}: {
  data: TripSeatsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  currentUser: SessionUser;
  selectedSeatIds: Set<string>;
  onToggleSeat: (seat: TripSeat) => void;
}) {
  const [showLegend, setShowLegend] = useState(true);

  if (isLoading) {
    return <TableSkeleton rows={4} cols={4} />;
  }

  if (isError || !data) {
    return (
      <EmptyState
        icon={Armchair}
        title="تعذّر تحميل خريطة المقاعد"
        desc="حدث خطأ في الاتصال. أعد المحاولة."
      />
    );
  }

  const bookableSeats = data.seats.filter(
    (s) => s.seatType === "REGULAR" || s.seatType === "VIP",
  );
  const heldSeats = data.seats.filter(
    (s) => s.seatType === "DRIVER" || s.seatType === "DISABLED" || s.seatType === "BLOCKED",
  );
  const seatState = (seat: TripSeat) =>
    seatVisual(seat, selectedSeatIds.has(seat.id), currentUser.sub);

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold text-muted-foreground">
        {(
          [
            ["available", "متاح"],
            ["selected", "محدد"],
            ["held-me", "محجوز لك"],
            ["held-other", "محجوز لغيرك"],
            ["booked", "مبيع"],
          ] as Array<[SeatVisual, string]>
        ).map(([v, label]) => (
          <span key={v} className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                "inline-block h-3.5 w-3.5 rounded-md border",
                visualCls[v],
              )}
            />
            {label}
          </span>
        ))}
        <button
          className="ms-auto text-[10px] font-bold text-primary underline-offset-2 hover:underline"
          onClick={() => setShowLegend((s) => !s)}
        >
          {showLegend ? "إخفاء" : "إظهار"} الدليل
        </button>
      </div>
      {showLegend && null}

      {/* Grid */}
      <div className="overflow-x-auto rounded-3xl border border-border bg-card p-5 shadow-card">
        <div
          className="mx-auto grid w-fit gap-2.5"
          style={{
            gridTemplateColumns: `repeat(${data.layout.columnsPerRow}, minmax(0, 1fr))`,
          }}
        >
          {data.seats.map((seat) => {
            const v = seatState(seat);
            const disabled =
              v === "booked" ||
              v === "held-other" ||
              v === "blocked" ||
              !data.trip.bookable;
            const isDriver = seat.seatType === "DRIVER";
            const price = Number(seat.price);
            return (
              <button
                key={seat.id}
                disabled={disabled}
                onClick={() => onToggleSeat(seat)}
                aria-label={`${seat.label}${v === "booked" ? " (مبيع)" : v === "held-other" ? " (محجوز لغيرك)" : price ? ` — ${price.toLocaleString("ar-SD")} جنيالسوداني` : ""}`}
                title={
                  isDriver
                    ? "مقعد السائق"
                    : `${seat.label} · ${seat.seatType === "VIP" ? "VIP · " : ""}${price.toLocaleString("ar-SD")}`
                }
                className={cn(
                  "relative flex h-12 w-12 flex-col items-center justify-center rounded-xl border text-[11px] font-bold transition-transform",
                  visualCls[v],
                  v === "selected" && "scale-105",
                  isDriver && "h-9 w-12 opacity-60",
                )}
                dir="ltr"
              >
                {isDriver ? (
                  <span className="text-[9px]">DRIVER</span>
                ) : (
                  <>
                    <span>{seat.label}</span>
                    {seat.seatType === "VIP" && (
                      <span className="text-[7px] font-extrabold tracking-wider">
                        VIP
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
        {heldSeats.length > 0 && null}
      </div>

      {bookableSeats.length === 0 && (
        <EmptyState
          icon={Armchair}
          title="لا توجد مقاعد متاحة"
          desc="جميع مقاعد هذه الرحلة محجوزة أو مبيعة."
        />
      )}
    </div>
  );
}
