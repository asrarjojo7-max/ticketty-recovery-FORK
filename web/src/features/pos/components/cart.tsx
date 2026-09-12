"use client";

import { useEffect, useState } from "react";
import { Trash2, BadgeCheck, Receipt, StickyNote } from "lucide-react";
import { cn, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CartSeat, CartPassenger } from "../types";
import { PAYMENT_METHODS, RESERVED_PAYMENT_METHODS } from "../types";
import type { PaymentMethod } from "@/features/bookings";

/**
 * POS cart: the single source for what's being sold in THIS session.
 * Totals shown here are display sums of backend-provided seat prices; the
 * authoritative amount is computed server-side at booking creation.
 */
export function Cart({
  seats,
  onRemove,
  onCheckout,
  isPending,
  passengers,
  onPassenger,
  stops,
}: {
  seats: CartSeat[];
  onRemove: (seatId: string) => void;
  onCheckout: (payload: {
    paymentMethod: PaymentMethod;
    passengers: CartPassenger[];
    notes: string;
    boardingStop?: string;
    dropOffStop?: string;
  }) => void;
  isPending: boolean;
  passengers: Record<string, CartPassenger>;
  onPassenger: (seatId: string, p: Partial<CartPassenger>) => void;
  stops: string[];
}) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  // محطتا الصعود والنزول — نفس بيانات نموذج الحجوزات (لا فقدان بيانات).
  // المشتق من stops هو الافتراضي؛ الـ override للمستخدم إذا غيّر يدويًا.
  // (اشتقاق لا state أولية — وإلا تفوت قيمة الرحلة عند تحمّلها المتأخر)
  const [boardingSel, setBoardingStop] = useState<string | null>(null);
  const [dropOffSel, setDropOffStop] = useState<string | null>(null);
  const boardingStop = boardingSel ?? stops[0] ?? "";
  const dropOffStop = dropOffSel ?? stops[stops.length - 1] ?? "";
  const total = seats.reduce((sum, s) => sum + s.price, 0);
  // نفس البيانات الإلزامية في تجربة الحجوزات: اسم + هاتف + هوية
  const allNamed =
    seats.length > 0 &&
    seats.every(
      (s) =>
        passengers[s.seatId]?.passengerName?.trim() &&
        passengers[s.seatId]?.passengerPhone?.trim() &&
        passengers[s.seatId]?.passengerNationalId?.trim(),
    );

  useEffect(() => {
    // default passenger identity as seller types — keeps the flow one-screen
    if (seats.length === 1 && !passengers[seats[0].seatId]) {
      onPassenger(seats[0].seatId, {
        seatId: seats[0].seatId,
        passengerName: "",
        passengerPhone: "",
      });
    }
  }, [seats, passengers, onPassenger]);

  return (
    <div className="flex max-h-[70vh] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-card lg:h-full lg:max-h-none">
      <div className="border-b border-border bg-muted/40 px-5 py-4">
        <p className="font-display text-base font-bold">سلة البيع</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {seats.length} مقعداً محدداً
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {seats.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            لم يتم تحديد مقاعد بعد. اضغط على مقعد من الخريطة لإضافته.
          </p>
        ) : (
          seats.map((seat) => {
            const p = passengers[seat.seatId];
            return (
              <div key={seat.seatId} className="rounded-2xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-sm font-bold">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      {seat.seatType === "VIP" ? <BadgeCheck className="h-3.5 w-3.5" /> : <Receipt className="h-3.5 w-3.5" />}
                    </span>
                    مقعد{" "}
                    <span dir="ltr" className="tabular-nums text-lg font-black text-primary">
                      {seat.label}
                    </span>
                    {seat.seatType === "VIP" && (
                      <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[9px] font-extrabold text-accent">VIP</span>
                    )}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="tabular text-sm font-extrabold text-primary">
                      {formatMoney(seat.price)}
                    </span>
                    <button
                      onClick={() => onRemove(seat.seatId)}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-destructive/70 transition hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`إزالة المقعد ${seat.label}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {seat.expiresAt && (
                  <p className="mt-1.5 text-[10px] font-semibold text-warning-foreground">
                    ⏳ الحجز ينتهي{" "}
                    {new Intl.DateTimeFormat("ar-SD", {
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(seat.expiresAt))}
                  </p>
                )}
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <Input
                    placeholder="اسم الراكب"
                    value={p?.passengerName ?? ""}
                    onChange={(e) =>
                      onPassenger(seat.seatId, {
                        seatId: seat.seatId,
                        passengerName: e.target.value,
                      })
                    }
                    className="h-11 text-base md:h-10 md:text-sm"
                  />
                  <Input
                    placeholder="هاتف الراكب"
                    value={p?.passengerPhone ?? ""}
                    onChange={(e) =>
                      onPassenger(seat.seatId, {
                        seatId: seat.seatId,
                        passengerPhone: e.target.value,
                      })
                    }
                    className="h-11 text-base md:h-10 md:text-sm"
                    dir="ltr"
                  />
                </div>
                <div className="mt-2">
                  <Input
                    placeholder="رقم الهوية / الجواز (مطلوب)"
                    value={p?.passengerNationalId ?? ""}
                    onChange={(e) =>
                      onPassenger(seat.seatId, {
                        seatId: seat.seatId,
                        passengerNationalId: e.target.value,
                      })
                    }
                    className="h-11 text-base md:h-10 md:text-sm"
                    dir="ltr"
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="space-y-3 border-t border-border p-4">
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-[11px] font-bold text-muted-foreground">
            محطة الصعود
            <select
              className="h-11 min-w-0 rounded-xl border border-input bg-card px-2 text-base md:h-10 md:text-sm"
              value={boardingStop}
              onChange={(e) => setBoardingStop(e.target.value)}
            >
              {stops.map((s2) => (
                <option key={s2} value={s2}>{s2}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[11px] font-bold text-muted-foreground">
            محطة النزول
            <select
              className="h-11 min-w-0 rounded-xl border border-input bg-card px-2 text-base md:h-10 md:text-sm"
              value={dropOffStop}
              onChange={(e) => setDropOffStop(e.target.value)}
            >
              {stops.map((s2) => (
                <option key={s2} value={s2}>{s2}</option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-bold text-muted-foreground">
            طريقة الدفع
          </p>
          {/* Phase 5 (Option A — Owner-approved): النقد فقط. الطرق
              الرقمية محفوظة وموثقة (enum كامل على الخادم) لكن تعطيلها
              هنا يمنع البائع من محاولة ستُرفض بـ 400 من الخادم. */}
          <div className="grid grid-cols-3 gap-1.5">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setPaymentMethod(m.value)}
                className={cn(
                  "min-h-11 rounded-xl border px-2 py-2 text-[11px] font-bold transition",
                  paymentMethod === m.value
                    ? "border-primary bg-primary-soft text-primary ring-2 ring-primary/25"
                    : "border-border text-muted-foreground hover:bg-muted/50",
                )}
                aria-pressed={paymentMethod === m.value}
              >
                {m.label}
              </button>
            ))}
            {RESERVED_PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                disabled
                title="غير متاحة بعد — الطرق الرقمية تحتاج سياسة تحقق لدى مزودي الدفع"
                className="min-h-11 cursor-not-allowed rounded-xl border border-dashed border-border px-2 py-2 text-[11px] font-bold text-muted-foreground/40"
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] leading-5 text-muted-foreground">
            الدفع نقداً فقط حالياً — الطرق الرقمية غير متاحة حتى إقرار
            سياسة التحقق لدى مزودي الدفع.
            <span className="mt-1 flex items-center gap-1 rounded-lg bg-warning/10 px-2 py-1 font-bold text-warning-foreground">
              🧪 نمط تجريبي (Pilot): البيع النقدي يُسجَّل مالياً كعمليات حقيقية — لا بوابة دفع إلكتروني مفعّلة بعد.
            </span>
          </p>
        </div>
        {showNotes ? (
          <div className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              placeholder="ملاحظات على الحجز (اختياري)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-11 text-base md:h-10 md:text-sm"
            />
          </div>
        ) : (
          <button
            onClick={() => setShowNotes(true)}
            className="inline-flex min-h-11 items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-primary"
          >
            <StickyNote className="h-3.5 w-3.5" /> إضافة ملاحظة
          </button>
        )}
        <div className="flex items-center justify-between rounded-2xl bg-gradient-soft px-4 py-3">
          <span className="text-xs font-bold text-muted-foreground">
            الإجمالي (للعرض)
          </span>
          <span className="tabular font-display text-xl font-extrabold text-primary">
            {formatMoney(total)}
          </span>
        </div>
        <Button
          className="h-12 w-full bg-gradient-primary text-sm font-extrabold shadow-glow"
          disabled={seats.length === 0 || isPending || !allNamed}
          onClick={() =>
            onCheckout({
              paymentMethod,
              passengers: seats.map(
                (s) =>
                  passengers[s.seatId] ?? {
                    seatId: s.seatId,
                    passengerName: "",
                    passengerPhone: "",
                  },
              ),
              notes,
              ...(boardingStop ? { boardingStop } : {}),
              ...(dropOffStop ? { dropOffStop } : {}),
            })
          }
        >
          <BadgeCheck className="h-4 w-4" />
          {isPending ? "جارٍ إتمام البيع..." : "إتمام البيع"}
        </Button>
        {!allNamed && seats.length > 0 && (
          <p className="text-center text-[10px] text-muted-foreground">
            أدخل اسم وهاتف ورقم هوية كل راكب قبل الإتمام
          </p>
        )}
      </div>
    </div>
  );
}
