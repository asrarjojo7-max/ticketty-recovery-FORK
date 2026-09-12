"use client";

import { useMemo, useState } from "react";
import { CalendarDays, TicketCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import type { Booking, TripSeat, TripSeatsResponse } from "@/features/bookings";
import { TicketPreview } from "@/features/bookings/components/professional-ticket";
import { MobileCartBar } from "./mobile-cart-bar";
import { useOrganizationForTicket } from "@/features/bookings/hooks/use-organization";
import { usePosTripSeats, usePosTrips, useCheckout } from "../hooks";
import { TripCards } from "./trip-cards";
import { SeatPanel } from "./seat-panel";
import { Cart } from "./cart";
import type { CartPassenger, CartSeat } from "../types";

/* ── Success view: the official printable tickets ───────────── */

function PosSuccessTickets({
  booking,
  trip,
  onClose,
}: {
  booking: Booking;
  trip: TripSeatsResponse["trip"];
  onClose: () => void;
}) {
  const orgQuery = useOrganizationForTicket();
  return (
    <TicketPreview
      booking={booking}
      trip={trip}
      organization={orgQuery.data ?? undefined}
      onClose={onClose}
    />
  );
}

/* ── POS feature ──────────────────────────────────────────── */

export function PosFeature() {
  // Default: no date filter — the rail lists upcoming sellable trips; sellers
  // narrow by date only when needed.
  const [date, setDate] = useState<string>("");
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartSeat[]>([]);
  const [passengers, setPassengers] = useState<Record<string, CartPassenger>>({});
  const [lastBooking, setLastBooking] = useState<Booking | null>(null);

  const tripsQuery = usePosTrips(date);
  const seatsQuery = usePosTripSeats(selectedTripId);
  const checkout = useCheckout(selectedTripId ?? "");

  const selectedTrip = useMemo(
    () => (tripsQuery.data ?? []).find((t) => t.id === selectedTripId),
    [tripsQuery.data, selectedTripId],
  );

    function selectTrip(tripId: string) {
    setSelectedTripId((current) => {
      if (current !== tripId) {
        setCart([]);
        setPassengers({});
      }
      return tripId;
    });
  }

  function toggleSeat(seat: TripSeat) {
    const inCart = cart.some((c) => c.seatId === seat.id);
    if (inCart) {
      setCart((c) => c.filter((s) => s.seatId !== seat.id));
      return;
    }
    // Only seats currently AVAILABLE can be added; holds happen on checkout
    // per-backend semantics (hold endpoint), so we track the price locally.
    if (seat.status !== "AVAILABLE") {
      toast.error("لا يمكن اختيار هذا المقعد", {
        description: "المقعد محجوز أو مبيع بالفعل.",
      });
      return;
    }
    setCart((c) => [
      ...c,
      {
        seatId: seat.id,
        label: seat.label,
        price: Number(seat.price),
        seatType: seat.seatType,
        expiresAt: null,
      },
    ]);
  }

  function removeFromCart(seatId: string) {
    setCart((c) => c.filter((s) => s.seatId !== seatId));
  }

  function setPassenger(seatId: string, patch: Partial<CartPassenger>) {
    setPassengers((p) => ({
      ...p,
      [seatId]: { ...p[seatId], ...patch, seatId } as CartPassenger,
    }));
  }

  function handleCheckout(payload: {
    paymentMethod: CartPassenger extends never ? never : import("@/features/bookings").PaymentMethod;
    passengers: CartPassenger[];
    notes: string;
    boardingStop?: string;
    dropOffStop?: string;
  }) {
    if (!selectedTripId) return;
    const tripId = selectedTripId;
    const seatIds = cart.map((c) => c.seatId);
    checkout.mutate(
      {
        tripId,
        seatIds,
        passengers: payload.passengers
          .filter((p) => p.passengerName?.trim() && p.passengerPhone?.trim())
          .map((p) => ({
            seatId: p.seatId,
            passengerName: p.passengerName,
            passengerPhone: p.passengerPhone,
            ...(p.passengerNationalId
              ? { passengerNationalId: p.passengerNationalId }
              : {}),
          })),
        paymentMethod: payload.paymentMethod,
        ...(payload.notes ? { notes: payload.notes } : {}),
        ...(payload.boardingStop ? { boardingStop: payload.boardingStop } : {}),
        ...(payload.dropOffStop ? { dropOffStop: payload.dropOffStop } : {}),
      },
      {
        onSuccess: (booking) => {
          setLastBooking(booking);
          setCart([]);
          setPassengers({});
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="نقطة البيع"
        title="شاشة البيع السريع"
        subtitle="اختر الرحلة، حدّد المقاعد، أدخل بيانات الركاب، وأتمم البيع في شاشة واحدة."
        icon={TicketCheck}
      />

      {/* Date filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-card">
          <CalendarDays className="h-4 w-4 text-primary" />
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSelectedTripId(null);
            }}
            className="min-w-36 border-0 p-0 text-base focus-visible:ring-0 md:h-10 md:text-sm"
            aria-label="تاريخ الرحلات"
          />
          {date ? (
            <button
              onClick={() => {
                setDate("");
                setSelectedTripId(null);
              }}
              className="text-[10px] font-bold text-primary hover:underline"
            >
              الكل
            </button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {tripsQuery.data?.length ?? 0} رحلة قابلة للبيع
        </p>
      </div>

      {/* 3-pane layout — شاشة واحدة: كل عمود يمرّر داخليًا داخل ارتفاع
          الشاشة (lg+) فلا تمرير صفحة طويل أثناء البيع.
          lg: أعمدة جانبية مضغوطة · xl: العرض الكامل المعتاد. */}
      <div className="grid gap-4 xl:h-[calc(100vh-11rem)] xl:grid-cols-[280px_minmax(0,1fr)_340px] xl:grid-rows-[minmax(0,1fr)]">
        <div className="xl:min-h-0 xl:overflow-y-auto xl:pe-1">
          <TripCards
            trips={tripsQuery.data}
            isLoading={tripsQuery.isLoading}
            selectedId={selectedTripId}
            onSelect={selectTrip}
          />
        </div>

        <div className="min-w-0 xl:min-h-0 xl:overflow-y-auto xl:pe-1">
          {selectedTrip ? (
            <SeatPanel
              data={seatsQuery.data}
              isLoading={seatsQuery.isLoading}
              isError={seatsQuery.isError}
              
              selectedSeatIds={new Set(cart.map((c) => c.seatId))}
              onToggleSeat={toggleSeat}
            />
          ) : (
            <div className="flex h-full min-h-64 items-center justify-center rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center">
              <p className="text-sm text-muted-foreground">
                اختر رحلة من القائمة لعرض خريطة مقاعدها
              </p>
            </div>
          )}
        </div>

        {/* عمود السلة — سطح المكتب: دائمًا ضمن ارتفاع الشاشة (شاشة بيع
            واحدة). الهاتف: مخفي هنا بـ CSS فقط (نفس الشجرة دائمًا — لا
            mismatch) وتُعرض نسخة الشريط السفلي المستقلة أسفله. */}
        <div className="hidden min-h-0 self-start xl:block">
          <div className="sticky top-0 max-h-[calc(100vh-11rem)]">
            <Cart
              key={`desk-${selectedTripId ?? "no-trip"}`}
              seats={cart}
              onRemove={removeFromCart}
              onCheckout={handleCheckout}
              isPending={checkout.isPending}
              passengers={passengers}
              onPassenger={setPassenger}
              stops={
                selectedTrip
                  ? selectedTrip.route.stops?.map((st) => st.city) ??
                    [selectedTrip.route.fromCity, selectedTrip.route.toCity]
                  : []
              }
            />
          </div>
        </div>
      </div>

      {/* حجز مساحة فعلية بعد آخر عنصر حتى لا يغطي الشريط الثابت آخر
          مقعد أو دليل الحالات عند نهاية التمرير. */}
      <div className="h-24 xl:hidden" aria-hidden="true" />

      {/* شريط الهاتف السفلي — عنصر مستقل دائم البنية، يحتوى على كل
          تفاصيل السلة (المقاعد + بيانات المسافر + الدفع + إتمام البيع).
          سلة فارغة = سطر ملخص صغير فقط؛ بمجرد اختيار مقعد تظهر كل
          التفاصيل هنا — المستخدم لا يعود للتمرير إطلاقًا. */}
      <MobileCartBar
        seats={cart}
        passengers={passengers}
        onPassenger={setPassenger}
        onRemove={removeFromCart}
        onCheckout={handleCheckout}
        isPending={checkout.isPending}
        stops={
          selectedTrip
            ? selectedTrip.route.stops?.map((st) => st.city) ??
              [selectedTrip.route.fromCity, selectedTrip.route.toCity]
            : []
        }
      />

      {lastBooking && seatsQuery.data && (
        <PosSuccessTickets
          booking={lastBooking}
          trip={seatsQuery.data.trip}
          onClose={() => setLastBooking(null)}
        />
      )}
    </div>
  );
}
