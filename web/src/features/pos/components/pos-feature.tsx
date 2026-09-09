"use client";

import { useMemo, useState } from "react";
import { CalendarDays, TicketCheck, X } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/components/layout/session-context";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/utils";
import type { Booking, TripSeat } from "@/features/bookings";
import { usePosTripSeats, usePosTrips, useCheckout } from "../hooks";
import { TripCards } from "./trip-cards";
import { SeatPanel } from "./seat-panel";
import { Cart } from "./cart";
import type { CartPassenger, CartSeat } from "../types";

/* ── Success dialog: shows the just-issued tickets ─────────── */

function TicketDialog({
  booking,
  onClose,
}: {
  booking: Booking;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-border bg-card shadow-elevated">
        <div className="relative bg-gradient-hero px-6 py-5 text-primary-foreground">
          <button
            onClick={onClose}
            className="absolute end-4 top-4 rounded-lg p-1.5 text-white/80 hover:bg-white/15"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">
            عملية بيع مكتملة
          </p>
          <p className="mt-1 font-display text-xl font-extrabold">
            تم إصدار التذاكر بنجاح
          </p>
          <p className="mt-1 text-xs text-white/75">
            الإجمالي المسجّل:{" "}
            <span className="tabular font-bold">
              {formatMoney(booking.totalAmount)}
            </span>
          </p>
        </div>
        <div className="max-h-[55vh] space-y-3 overflow-y-auto p-5">
          {booking.tickets.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-2xl border border-border bg-background p-4"
            >
              <div>
                <p className="text-sm font-bold">
                  {t.passengerName} · مقعد{" "}
                  <span dir="ltr">{t.seatLabel}</span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground" dir="ltr">
                  {t.number}
                </p>
              </div>
              <div className="text-end">
                <p className="tabular text-sm font-extrabold text-primary">
                  {formatMoney(t.fare)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {t.qrCode ? "QR جاهز" : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 border-t border-border p-4">
          <Button onClick={onClose} className="flex-1 bg-gradient-primary font-bold">
            بيع جديد
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── POS feature ──────────────────────────────────────────── */

export function PosFeature() {
  const user = useSession();
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

      {/* 3-pane layout */}
      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        <div className="xl:max-h-[calc(100vh-13rem)] xl:overflow-y-auto xl:pe-1">
          <TripCards
            trips={tripsQuery.data}
            isLoading={tripsQuery.isLoading}
            selectedId={selectedTripId}
            onSelect={selectTrip}
          />
        </div>

        <div className="min-w-0">
          {selectedTrip ? (
            <SeatPanel
              data={seatsQuery.data}
              isLoading={seatsQuery.isLoading}
              isError={seatsQuery.isError}
              currentUser={user}
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

        <div className="xl:sticky xl:top-24 xl:self-start">
                <Cart
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

      {lastBooking && (
        <TicketDialog booking={lastBooking} onClose={() => setLastBooking(null)} />
      )}
    </div>
  );
}
