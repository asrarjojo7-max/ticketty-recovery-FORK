"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Bus, CalendarClock, Loader2, MapPin, RefreshCw, Ticket } from "lucide-react";
import { useSession } from "@/components/layout/session-context";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useTrips } from "@/features/trips";
import { formatTripDate } from "@/features/trips/formatters";
import { BookingForm } from "./booking-form";
import { BookingHistory } from "./booking-history";
import { BusSeatMap } from "./bus-seat-map";
import { SeatHoldTimer } from "./seat-hold-timer";
import { TicketPreview } from "./ticket-preview";
import { useHoldSeat, useReleaseSeat, useTripSeats } from "../hooks/use-trip-seats";
import type { Booking, TripSeat } from "../types";

function hasPermission(permissions: string[], permission: string): boolean {
  return permissions.includes("*") || permissions.includes(permission);
}

export function BookingsFeature() {
  const user = useSession();
  const tripsQuery = useTrips();
  const bookableTrips = useMemo(
    () => tripsQuery.data?.filter((trip) => trip.status === "SCHEDULED" || trip.status === "OPEN") ?? [],
    [tripsQuery.data],
  );
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [completedBooking, setCompletedBooking] = useState<Booking | null>(null);
  const seatsQuery = useTripSeats(selectedTripId);
  const holdMutation = useHoldSeat(selectedTripId ?? "");
  const releaseMutation = useReleaseSeat(selectedTripId ?? "");
  const canBook = hasPermission(user.permissions, "bookings.write");

  const selectedSeats = seatsQuery.data?.seats.filter((seat) => selectedSeatIds.includes(seat.id)) ?? [];

  async function releaseSelectedSeats() {
    const seatsToRelease = [...selectedSeatIds];
    setSelectedSeatIds([]);
    await Promise.allSettled(seatsToRelease.map((seatId) => releaseMutation.mutateAsync(seatId)));
  }

  async function changeTrip(tripId: string) {
    if (selectedSeatIds.length) await releaseSelectedSeats();
    setSelectionError(null);
    setSelectedTripId(tripId || null);
  }

  async function selectSeat(seat: TripSeat) {
    setSelectionError(null);
    if (!selectedTripId || !canBook) return;

    if (selectedSeatIds.includes(seat.id)) {
      await releaseMutation.mutateAsync(seat.id);
      setSelectedSeatIds((current) => current.filter((id) => id !== seat.id));
      return;
    }

    try {
      await holdMutation.mutateAsync(seat.id);
      setSelectedSeatIds((current) => [...current, seat.id]);
    } catch (error) {
      const conflict =
        error instanceof Error && error.message.includes("غير متاح");
      setSelectionError(
        conflict
          ? "هذا المقعد حُجز للتو بواسطة مستخدم آخر. تم تحديث المقاعد المتاحة."
          : error instanceof Error
            ? error.message
            : "تعذر تحديد المقعد.",
      );
      toast.error(conflict ? "المقعد محجوز لمستخدم آخر" : "تعذّر تحديد المقعد", {
        description: conflict ? "تم تحديث خريطة المقاعد." : undefined,
      });
      await seatsQuery.refetch();
    }
  }

  function bookingCompleted(booking: Booking) {
    setSelectedSeatIds([]);
    setSelectionError(null);
    setCompletedBooking(booking);
  }

  const selectedTrip = seatsQuery.data?.trip;

  return (
    <div className="mx-auto max-w-[96rem] space-y-6">
      <PageHeader
        eyebrow="نقطة البيع"
        title="حجز رحلة جديدة"
        subtitle="اختر الرحلة والمقعد، ثم أكمل بيانات المسافر لإصدار تذكرة جاهزة للطباعة."
        icon={Ticket}
      />

      <Card className="border-primary/10">
        <CardContent className="p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-xs font-bold text-primary-foreground shadow-sm">١</span>
            <div><label htmlFor="booking-trip" className="block text-sm font-semibold">اختر الرحلة</label><p className="mt-0.5 text-xs text-muted-foreground">الرحلات المفتوحة والمتاحة للحجز فقط</p></div>
          </div>
          {tripsQuery.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : tripsQuery.isError ? (
            <div className="flex items-center gap-3 text-sm text-destructive"><AlertCircle className="h-4 w-4" />تعذر تحميل الرحلات<Button variant="outline" size="sm" onClick={() => tripsQuery.refetch()}><RefreshCw /> إعادة المحاولة</Button></div>
          ) : (
            <select
              id="booking-trip"
              className="flex h-11 w-full rounded-xl border border-input bg-card px-3.5 text-sm shadow-sm transition-colors hover:border-primary/25 focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/10"
              value={selectedTripId ?? ""}
              onChange={(event) => void changeTrip(event.target.value)}
            >
              <option value="">اختر رحلة مفتوحة للحجز</option>
              {bookableTrips.map((trip) => (
                <option key={trip.id} value={trip.id}>{trip.route.name} — {formatTripDate(trip.departureAt)} — {trip.bus.plateNumber}</option>
              ))}
            </select>
          )}
          {!tripsQuery.isLoading && !tripsQuery.isError && bookableTrips.length === 0 ? <p className="mt-2 text-xs text-warning-foreground">لا توجد رحلات مفتوحة للحجز حاليًا.</p> : null}
        </CardContent>
      </Card>

      {!selectedTripId ? (
        <Card><EmptyState icon={<Ticket className="h-11 w-11" />} title="ابدأ باختيار الرحلة" description="سيظهر مخطط المقاعد وأسعارها بعد اختيار رحلة مفتوحة." /></Card>
      ) : seatsQuery.isLoading ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]"><Skeleton className="h-[620px]" /><Skeleton className="h-[420px]" /></div>
      ) : seatsQuery.isError || !seatsQuery.data ? (
        <Card><div className="flex flex-col items-center gap-3 py-16"><AlertCircle className="h-10 w-10 text-destructive" /><p>تعذر تحميل مقاعد الرحلة.</p><Button variant="outline" onClick={() => seatsQuery.refetch()}><RefreshCw /> إعادة المحاولة</Button></div></Card>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <Card>
            <CardHeader className="border-b border-border/60 pb-4">
              <CardTitle className="flex items-center gap-3 text-lg"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-xs font-bold text-primary-foreground">٢</span><span className="font-display">اختر المقعد</span><Bus className="mr-auto h-5 w-5 text-primary" /></CardTitle>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{seatsQuery.data.trip.route.name}</span>
                <span className="flex items-center gap-1"><CalendarClock className="h-4 w-4" />{formatTripDate(seatsQuery.data.trip.departureAt)}</span>
              </div>
            </CardHeader>
            <CardContent>
              {!canBook ? <p className="mb-4 rounded-md bg-warning/15 p-3 text-sm text-warning-foreground">يمكنك عرض المقاعد فقط؛ حسابك لا يملك صلاحية إنشاء الحجوزات.</p> : null}
              {selectionError ? <p className="mb-4 flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{selectionError}</p> : null}
              <BusSeatMap
                seats={seatsQuery.data.seats}
                rows={seatsQuery.data.layout.rows}
                columnsPerRow={seatsQuery.data.layout.columnsPerRow}
                aisleAfterColumn={seatsQuery.data.layout.aisleAfterColumn}
                selectedSeatIds={selectedSeatIds}
                pendingSeatId={holdMutation.isPending || releaseMutation.isPending ? (holdMutation.variables ?? undefined) : undefined}
                disabled={!canBook || holdMutation.isPending || releaseMutation.isPending || !seatsQuery.data.trip.bookable}
                onSeatClick={(seat) => void selectSeat(seat)}
              />
              {holdMutation.isPending || releaseMutation.isPending ? <p className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />جارٍ تحديث حالة المقعد...</p> : null}
            </CardContent>
          </Card>

          <Card className="lg:sticky lg:top-24">
            <CardContent className="p-5">
              {selectedSeats.length && selectedTrip ? (
                <>
                {holdMutation.data?.expiresAt ? <SeatHoldTimer expiresAt={holdMutation.data.expiresAt} onExpired={() => void releaseSelectedSeats()} /> : null}
                <BookingForm
                  key={selectedSeatIds.join("-")}
                  trip={selectedTrip}
                  seats={selectedSeats}
                  onSuccess={bookingCompleted}
                  onCancel={() => void releaseSelectedSeats()}
                  onConflict={() => { setSelectedSeatIds([]); void seatsQuery.refetch(); }}
                />
                </>
              ) : (
                <EmptyState icon={<Ticket className="h-9 w-9" />} title="اختر مقعدًا متاحًا" description="سيظهر نموذج بيانات الراكب هنا بعد تحديد المقعد." className="py-12" />
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <BookingHistory canManage={canBook} />

      {completedBooking && selectedTrip ? <TicketPreview booking={completedBooking} trip={selectedTrip} onClose={() => setCompletedBooking(null)} /> : null}
    </div>
  );
}
