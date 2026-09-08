"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, Loader2, TicketCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { useCreateBooking } from "../hooks/use-create-booking";
import type { Booking, PaymentMethod, TripSeat, TripSeatsResponse } from "../types";

interface BookingFormProps {
  trip: TripSeatsResponse["trip"];
  seats: TripSeat[];
  onSuccess: (booking: Booking) => void;
  onCancel: () => void;
  onConflict: () => void;
}

const initialForm = {
  paymentMethod: "CASH" as PaymentMethod,
  paymentReference: "",
};

type PassengerFields = {
  passengerName: string;
  passengerPhone: string;
  passengerNationalId: string;
};

export function BookingForm({ trip, seats, onSuccess, onCancel, onConflict }: BookingFormProps) {
  const [form, setForm] = useState(initialForm);
  const [passengers, setPassengers] = useState<Record<string, PassengerFields>>(() =>
    Object.fromEntries(
      seats.map((seat) => [seat.id, { passengerName: "", passengerPhone: "", passengerNationalId: "" }]),
    ),
  );
  const mutation = useCreateBooking();
  const total = seats.reduce((sum, seat) => sum + Number(seat.price), 0);
  const intermediateStops = trip.route.stops ?? [];
  const stops = [
    trip.route.fromCity,
    ...intermediateStops.map((stop) => stop.city),
    trip.route.toCity,
  ];
  const [boardingStop, setBoardingStop] = useState(trip.route.fromCity);
  const [dropOffStop, setDropOffStop] = useState(trip.route.toCity);

  function updateField(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updatePassenger(seatId: string, key: keyof PassengerFields, value: string) {
    setPassengers((current) => ({ ...current, [seatId]: { ...current[seatId], [key]: value } }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate(
      {
        tripId: trip.id,
        seatIds: seats.map((seat) => seat.id),
        passengers: seats.map((seat) => ({
          seatId: seat.id,
          passengerName: passengers[seat.id].passengerName.trim(),
          passengerPhone: passengers[seat.id].passengerPhone.trim(),
          passengerNationalId: passengers[seat.id].passengerNationalId.trim() || undefined,
        })),
        paymentMethod: form.paymentMethod,
        paymentReference: form.paymentReference.trim() || undefined,
        boardingStop,
        dropOffStop,
      },
      {
        onSuccess,
        onError: (error) => {
          if (error.message.includes("غير متاح") || error.message.includes("الحجز")) onConflict();
        },
      },
    );
  }

  const error = mutation.error instanceof Error ? mutation.error.message : null;
  const selectClass = "flex h-10 w-full rounded-xl border border-input bg-card px-3.5 text-sm shadow-sm transition-colors hover:border-primary/25 focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/10";

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex items-start gap-3 border-b border-border/60 pb-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-bold text-primary-foreground">٣</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold">بيانات المسافر والدفع</h2>
          <p className="mt-1 text-sm text-muted-foreground">المقعد المحدد: {seats.map((seat) => seat.label).join("، ")}</p>
        </div>
        <div className="rounded-xl bg-primary/10 p-2 text-primary"><TicketCheck className="h-5 w-5" /></div>
      </div>

      <div className="max-h-[38vh] space-y-4 overflow-y-auto pe-1">
        {seats.map((seat, index) => {
          const passenger = passengers[seat.id];
          return (
            <section key={seat.id} className="space-y-3 rounded-xl border bg-muted/25 p-3">
              <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">المسافر {index + 1}</h3><span className="rounded-lg bg-primary/10 px-2 py-1 text-xs font-bold text-primary">المقعد {seat.label}</span></div>
              <div className="space-y-2"><label htmlFor={`passenger-name-${seat.id}`} className="text-xs font-medium">اسم الراكب</label><Input id={`passenger-name-${seat.id}`} maxLength={200} value={passenger.passengerName} onChange={(event) => updatePassenger(seat.id, "passengerName", event.target.value)} required autoFocus={index === 0} /></div>
              <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><label htmlFor={`passenger-phone-${seat.id}`} className="text-xs font-medium">رقم الهاتف</label><Input id={`passenger-phone-${seat.id}`} type="tel" maxLength={30} value={passenger.passengerPhone} onChange={(event) => updatePassenger(seat.id, "passengerPhone", event.target.value)} required /></div><div className="space-y-2"><label htmlFor={`passenger-id-${seat.id}`} className="text-xs font-medium">رقم الهوية / الجواز</label><Input id={`passenger-id-${seat.id}`} maxLength={50} value={passenger.passengerNationalId} onChange={(event) => updatePassenger(seat.id, "passengerNationalId", event.target.value)} /></div></div>
            </section>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="boarding-stop" className="text-sm font-medium">محطة الصعود</label>
          <select id="boarding-stop" className={selectClass} value={boardingStop} onChange={(event) => setBoardingStop(event.target.value)}>
            {stops.map((stop) => <option key={`from-${stop}`} value={stop}>{stop}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="dropoff-stop" className="text-sm font-medium">محطة النزول</label>
          <select id="dropoff-stop" className={selectClass} value={dropOffStop} onChange={(event) => setDropOffStop(event.target.value)}>
            {stops.map((stop) => <option key={`to-${stop}`} value={stop}>{stop}</option>)}
          </select>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">طريقة الدفع</legend>
        <div className="grid grid-cols-1 gap-3">
          {/* Phase 5 (Option A): النقد فقط — الطرق الرقمية محفوظة حتى
              إقرار سياسة التحقق (providers + reconciliation). قرار المالك. */}
          <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${form.paymentMethod === "CASH" ? "border-primary bg-primary/5" : ""}`}>
            <input type="radio" name="payment-method" value="CASH" checked={form.paymentMethod === "CASH"} onChange={() => updateField("paymentMethod", "CASH")} />
            نقداً
          </label>
          <p className="text-xs text-muted-foreground">الطرق الرقمية (بطاقة/محافظ إلكترونية) غير متاحة بعد وستُفعَّل عند إقرار سياسة التحقق.</p>
        </div>
      </fieldset>

      <div className="rounded-lg bg-muted p-4">
        <div className="flex items-center justify-between text-sm"><span>عدد المقاعد</span><span>{seats.length}</span></div>
        <div className="mt-2 flex items-center justify-between border-t pt-3 font-bold"><span>الإجمالي</span><span className="text-lg text-primary">{formatCurrency(total)} ج.س</span></div>
      </div>

      {error ? (
        <p className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error.includes("غير متاح") ? "تعذر إتمام الحجز لأن أحد المقاعد حُجز للتو. تم تحديث المخطط، اختر مقعدًا متاحًا." : error}</p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={mutation.isPending}>إلغاء</Button>
        <Button type="submit" disabled={mutation.isPending || seats.length === 0}>
          {mutation.isPending ? <Loader2 className="animate-spin" /> : <TicketCheck />}
          تأكيد الحجز وإصدار التذكرة
        </Button>
      </div>
    </form>
  );
}
