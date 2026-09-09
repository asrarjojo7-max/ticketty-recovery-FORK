"use client";

import { Armchair } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeletons";
import { UnifiedSeatMap } from "@/components/seats/unified-seat-map";
import type { TripSeat, TripSeatsResponse } from "@/features/bookings";

/**
 * خريطة مقاعد POS — نفس المكوّن الموحّد المستخدم في الحجوزات
 * (لغة تصميم واحدة في كل النظام: مقدمة الباص، الممر، الحالات،
 * الدليل، والسعر بوحدة SDG).
 */
export function SeatPanel({
  data,
  isLoading,
  isError,
  selectedSeatIds,
  onToggleSeat,
}: {
  data: TripSeatsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  selectedSeatIds: Set<string>;
  onToggleSeat: (seat: TripSeat) => void;
}) {
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

  return (
    <div className="space-y-4">
      {!data.trip.bookable ? (
        <p className="rounded-xl bg-warning/10 p-3 text-center text-sm font-semibold text-warning-foreground">
          هذه الرحلة غير متاحة للبيع حاليًا
        </p>
      ) : null}
      <UnifiedSeatMap
        seats={data.seats}
        rows={data.layout.rows}
        columnsPerRow={data.layout.columnsPerRow}
        aisleAfterColumn={data.layout.aisleAfterColumn}
        selectedSeatIds={selectedSeatIds}
        disabled={!data.trip.bookable}
        onSeatClick={onToggleSeat}
      />
      {bookableSeats.length === 0 ? (
        <EmptyState
          icon={Armchair}
          title="لا توجد مقاعد متاحة"
          desc="جميع مقاعد هذه الرحلة محجوزة أو مبيعة."
        />
      ) : null}
    </div>
  );
}
