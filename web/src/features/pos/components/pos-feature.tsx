"use client";

import { useMemo, useState } from "react";
import { CalendarDays, TicketCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Input } from "@/components/ui/input";
import type { Booking, TripSeat, TripSeatsResponse } from "@/features/bookings";
import { TicketPreview } from "@/features/bookings/components/professional-ticket";
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
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-card">
          <CalendarDays className="h-4 w-4 text-primary" />
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSelectedTripId(null);
            }}
            className="h-7 border-0 p-0 text-xs focus-visible:ring-0"
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

      <div className="h-0 lg:hidden" aria-hidden="true" style={{ paddingBottom: "10rem" }} />
      {/* 3-pane layout — شاشة واحدة: كل عمود يمرّر داخليًا داخل ارتفاع
          الشاشة (lg+) فلا تمرير صفحة طويل أثناء البيع.
          lg: أعمدة جانبية مضغوطة · xl: العرض الكامل المعتاد. */}
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_320px] xl:grid-cols-[280px_minmax(0,1fr)_340px] lg:h-[calc(100vh-11rem)] lg:grid-rows-[minmax(0,1fr)]">
        <div className="lg:min-h-0 lg:overflow-y-auto lg:pe-1">
          <TripCards
            trips={tripsQuery.data}
            isLoading={tripsQuery.isLoading}
            selectedId={selectedTripId}
            onSelect={selectTrip}
          />
        </div>

        <div className="min-w-0 lg:min-h-0 lg:overflow-y-auto lg:pe-1">
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

        {/* الهاتف: عمود السلة يصبح شريطًا سفليًا مثبتًا يظهر فقط عند
            اختيار مقاعد (سلة فارغة = لا شريط، الشاشة كلها للخريطة
            والقائمة — لا حجب نقر ولا تمرير طويل).
            lg+: يبقى العمود الجانبي المعتاد داخل ارتفاع الشاشة. */}
        <div
          className={
            cart.length
              ? "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-elevated backdrop-blur lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:pb-0 lg:shadow-none lg:backdrop-blur-none lg:min-h-0 lg:self-start"
              : "contents lg:block lg:min-h-0 lg:self-start"
          }
        >
          <div className={cart.length ? "lg:sticky lg:top-0 lg:max-h-[calc(100vh-11rem)]" : "hidden lg:block lg:sticky lg:top-0 lg:max-h-[calc(100vh-11rem)]"}>
                <Cart
        key={selectedTripId ?? "no-trip"}
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
