"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Minus, Plus, Trash2 } from "lucide-react";
import { cn, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CartSeat, CartPassenger } from "../types";
import type { PaymentMethod } from "@/features/bookings";

/**
 * شريط السلة السفلي — وضع الهاتف في نقطة البيع.
 *
 * المشكلة التي يحلها: على الهاتف كان الكاشير يتمرر صفحة كاملة بين
 * خريطة المقاعد والسلة (وفي تصميم سابق حتى اختفت التفاصيل عند أول
 * مقعد). هنا الشريط مثبّت أسفل الشاشة دائمًا ويعرض كل شيء مكانه:
 *
 *   سلة فارغة   → سطر صغير «اختر مقعدًا من الخريطة»
 *   مقعد محدد   → ملخص (مقاعد/الإجمالي) + زر فتح التفاصيل
 *   التفاصيل    → Bottom-sheet قابل للطي: بيانات كل مسافر، المحطات،
 *                 الدفع، وإتمام البيع — كله داخل الشريط بلا تمرير صفحة
 *
 * نفس منطق Cart تمامًا (نفس الحمولة، نفس شروط الإتمام، نفس Pilot
 * badge) — فقط تخطيط هواتف. يختفي كليًا من lg فما فوق (opacity/
 * display) ليبقى سطح المكتب على العمود الجانبي المعتاد.
 */
export function MobileCartBar({
  seats,
  passengers,
  onPassenger,
  onRemove,
  onCheckout,
  isPending,
  stops,
}: {
  seats: CartSeat[];
  passengers: Record<string, CartPassenger>;
  onPassenger: (seatId: string, p: Partial<CartPassenger>) => void;
  onRemove: (seatId: string) => void;
  onCheckout: (payload: {
    paymentMethod: PaymentMethod;
    passengers: CartPassenger[];
    notes: string;
    boardingStop?: string;
    dropOffStop?: string;
  }) => void;
  isPending: boolean;
  stops: string[];
}) {
  // حالة الفتح تُقرأ فقط من تفاعل المستخدم — لا من طول السلة —
  // فلا يتبدل هيكل الشجرة بين الخادم والعميل (لا hydration mismatch).
  const [open, setOpen] = useState(false);
  // Pilot: النقد هو الطريقة الوحيدة المتاحة فعليًا — القيمة ثابتة
  // وتُرسل في الحمولة كمسؤولية خادم (مطابقة لسلوك سلة سطح المكتب).
  const paymentMethod = "CASH" satisfies PaymentMethod;
  const [boardingSel, setBoardingStop] = useState<string | null>(null);
  const [dropOffSel, setDropOffStop] = useState<string | null>(null);
  const boardingStop = boardingSel ?? stops[0] ?? "";
  const dropOffStop = dropOffSel ?? stops[stops.length - 1] ?? "";

  const total = seats.reduce((sum, s) => sum + s.price, 0);
  const allNamed =
    seats.length > 0 &&
    seats.every(
      (s) =>
        passengers[s.seatId]?.passengerName?.trim() &&
        passengers[s.seatId]?.passengerPhone?.trim() &&
        passengers[s.seatId]?.passengerNationalId?.trim(),
    );

  // من lg فما فوق: لا وجود للشريط إطلاقًا (العمود الجانبي يتكفل)
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 shadow-elevated backdrop-blur xl:hidden">
      {open ? (
        <div className="max-h-[68vh] overflow-y-auto overscroll-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mb-2 flex w-full items-center justify-between rounded-xl bg-muted/60 px-3 py-2 text-xs font-bold text-muted-foreground"
            aria-label="طي تفاصيل السلة"
          >
            <span>تفاصيل السلة ({seats.length} مقعدًا)</span>
            <ChevronDown className="h-4 w-4" />
          </button>

          {/* مقاعد + بيانات كل مسافر — نفس حقول سطح المكتب حرفيًا */}
          <div className="space-y-2">
            {seats.map((seat) => {
              const p = passengers[seat.seatId];
              return (
                <div key={seat.seatId} className="rounded-2xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold">
                      مقعد{" "}
                      <span dir="ltr" className="tabular-nums text-lg font-black text-primary">
                        {seat.label}
                      </span>
                      <span className="ms-1 tabular text-xs font-extrabold text-primary">
                        {formatMoney(seat.price)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemove(seat.seatId)}
                      className="rounded-lg p-1.5 text-destructive/70 hover:bg-destructive/10"
                      aria-label={`إزالة المقعد ${seat.label}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Input
                      placeholder="اسم الراكب"
                      value={p?.passengerName ?? ""}
                      onChange={(e) =>
                        onPassenger(seat.seatId, {
                          seatId: seat.seatId,
                          passengerName: e.target.value,
                        })
                      }
                      className="h-11 text-base"
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
                      className="h-11 text-base"
                      dir="ltr"
                      inputMode="tel"
                    />
                  </div>
                  <Input
                    placeholder="رقم الهوية / الجواز (مطلوب)"
                    value={p?.passengerNationalId ?? ""}
                    onChange={(e) =>
                      onPassenger(seat.seatId, {
                        seatId: seat.seatId,
                        passengerNationalId: e.target.value,
                      })
                    }
                    className="mt-2 h-11 text-base"
                    dir="ltr"
                    inputMode="numeric"
                  />
                </div>
              );
            })}
          </div>

          {/* المحطات + الدفع — نفس خيارات سطح المكتب */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-[11px] font-bold text-muted-foreground">
              محطة الصعود
              <select
                className="h-11 rounded-xl border border-input bg-card px-2 text-base"
                value={boardingStop}
                onChange={(e) => setBoardingStop(e.target.value)}
              >
                {stops.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-[11px] font-bold text-muted-foreground">
              محطة النزول
              <select
                className="h-11 rounded-xl border border-input bg-card px-2 text-base"
                value={dropOffStop}
                onChange={(e) => setDropOffStop(e.target.value)}
              >
                {stops.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 rounded-2xl border border-border bg-card p-3">
            <p className="text-[11px] font-bold text-muted-foreground">طريقة الدفع</p>
            <div className="mt-2 flex items-center gap-2 rounded-xl bg-primary-soft px-3 py-2 text-sm font-bold text-primary">
              💵 نقدًا (CASH)
            </div>
            <p className="mt-2 text-[10px] leading-5 text-muted-foreground">
              🧪 نمط تجريبي (Pilot): البيع النقدي يُسجَّل مالياً كعمليات حقيقية — لا بوابة دفع إلكتروني مفعّلة بعد.
            </p>
          </div>

          {/* إتمام البيع — نفس الشروط حرفيًا */}
          <Button
            className="mt-3 w-full"
            size="lg"
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
                notes: "",
                ...(boardingStop ? { boardingStop } : {}),
                ...(dropOffStop ? { dropOffStop } : {}),
              })
            }
          >
            {isPending ? "جارٍ الإتمام…" : `إتمام البيع · ${formatMoney(total)}`}
          </Button>
          {!allNamed && seats.length > 0 ? (
            <p className="mt-1.5 text-center text-[10px] font-semibold text-warning-foreground">
              أكمل اسم وهاتف ورقم هوية كل راكب قبل الإتمام
            </p>
          ) : null}
        </div>
      ) : (
        /* الشريط المطوي: ملخص دائم + فتح التفاصيل */
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "flex w-full items-center justify-between gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-start",
            seats.length === 0 && "cursor-default",
          )}
          aria-label={seats.length ? "فتح تفاصيل السلة" : "السلة فارغة"}
        >
          <span className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
            <ChevronUp className="h-4 w-4 text-primary" />
            {seats.length === 0
              ? "اختر مقعدًا من الخريطة أعلاه"
              : `${seats.length} مقعدًا محددًا · ${formatMoney(total)}`}
          </span>
          {seats.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-primary px-3 py-1.5 text-[11px] font-extrabold text-primary-foreground shadow-glow">
              <Plus className="h-3.5 w-3.5" />
              التفاصيل وإتمام البيع
            </span>
          ) : (
            <Minus className="h-4 w-4 text-muted-foreground/50" />
          )}
        </button>
      )}
    </div>
  );
}
