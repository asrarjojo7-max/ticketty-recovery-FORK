"use client";

import { MapPin, Clock, BusFront, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import type { PosTripCard } from "../types";
import { isSellable } from "../types";

function tripStatusChip(status: PosTripCard["status"]): string {
  switch (status) {
    case "OPEN":
      return "bg-success/15 text-success";
    case "SCHEDULED":
      return "bg-primary-soft text-primary";
    case "FULL":
      return "bg-warning/20 text-warning-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

const statusLabel: Record<string, string> = {
  SCHEDULED: "مجدولة",
  OPEN: "مفتوحة",
  FULL: "مكتملة",
  DEPARTED: "انطلقت",
  COMPLETED: "مكتملة",
  CANCELLED: "ملغاة",
};

/**
 * Sellable trips list — left rail of the POS screen. Single tap selects a
 * trip and hydrates the seat map on the right.
 */
export function TripCards({
  trips,
  isLoading,
  selectedId,
  onSelect,
}: {
  trips: PosTripCard[] | undefined;
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (tripId: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-muted/60" />
        ))}
      </div>
    );
  }

  const sellable = (trips ?? []).filter((t) => isSellable(t));

  if (sellable.length === 0) {
    return (
      <EmptyState
        icon={BusFront}
        title="لا توجد رحلات قابلة للبيع"
        desc="جرّب اختيار تاريخ آخر أو أضف رحلة جديدة."
      />
    );
  }

  return (
    <div className="space-y-3">
      {sellable.map((trip) => {
        const active = trip.id === selectedId;
        const capacity = trip.bus?.seatTemplate
          ? trip.bus.seatTemplate.rows * trip.bus.seatTemplate.columnsPerRow
          : trip._count.tripSeats;
        const sold = trip._count.tickets;
        const remaining = Math.max(0, capacity - sold);
        return (
          <button
            key={trip.id}
            onClick={() => onSelect(trip.id)}
            aria-pressed={active}
            className={cn(
              "w-full rounded-2xl border p-4 text-start shadow-card transition",
              active
                ? "border-primary bg-primary-soft ring-2 ring-primary/30"
                : "border-border bg-card hover:-translate-y-0.5 hover:shadow-elevated",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    active
                      ? "bg-gradient-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <BusFront className="h-4 w-4" />
                </span>
                <p className="truncate font-display text-sm font-bold">
                  {trip.route.fromCity} ← {trip.route.toCity}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${tripStatusChip(trip.status)}`}
              >
                {statusLabel[trip.status] ?? trip.status}
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {new Intl.DateTimeFormat("ar-SD", {
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(trip.departureAt))}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                متبقي {remaining} مقعداً
              </span>
            </div>
            {active && (
              <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-primary">
                فتح خريطة المقاعد <ArrowLeft className="h-3 w-3" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
