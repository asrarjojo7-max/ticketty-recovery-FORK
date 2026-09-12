"use client";

import { Armchair, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeletons";
import { UnifiedSeatMap } from "@/components/seats/unified-seat-map";
import type { TripSeat, TripSeatsResponse } from "@/features/bookings";

/**
 * خريطة مقاعد POS — نفس المكوّن الموحّد المستخدم في الحجوزات
 * (لغة تصميم واحدة في كل النظام: مقدمة الباص، السائق، الأبواب،
 * الممر، الحالات، الدليل، والسعر بوحدة SDG).
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
  const summary = data.summary;

  return (
    <div className="space-y-4">
      {/* ملخص الرحلة الحي — من بيانات الحجوزات الفعلية لا من الواجهة */}
      {summary ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3 text-xs font-bold shadow-card">
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4 text-primary" />
            إجمالي المقاعد: <span className="tabular-nums">{summary.total}</span>
          </span>
          <span className="rounded-lg bg-destructive/10 px-2 py-1 text-destructive">
            مبيع: <span className="tabular-nums">{summary.sold}</span>
          </span>
          <span className="rounded-lg bg-success/10 px-2 py-1 text-success-foreground">
            متاح: <span className="tabular-nums">{summary.available}</span>
          </span>
          <span className="ms-auto text-[10px] font-normal text-muted-foreground">
            يتحدث تلقائيًا كل ١٥ ثانية
          </span>
        </div>
      ) : null}

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
