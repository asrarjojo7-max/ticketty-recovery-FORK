import type { PaymentMethod } from "@/features/bookings";
import type { PosTripCard } from "./api";

export type { PosTripCard } from "./api";

export interface CartSeat {
  seatId: string;
  label: string;
  price: number;
  seatType: string;
  expiresAt: string | null;
}

export interface CartPassenger {
  seatId: string;
  passengerName: string;
  passengerPhone: string;
  passengerNationalId?: string;
}

/**
 * Phase 5 (Option A — Owner-approved): CASH only.
 * Digital methods (CARD/BANKAK/MTN_MOMO/ZAIN_CASH/BANK_TRANSFER) stay
 * declared on the backend enum — reserved & documented — but cannot be
 * recorded through the API until a provider verification + reconciliation
 * policy exists (kills phantom payments: digital "confirmation" without
 * external verification created confirmed tickets + revenue from nothing).
 */
export const PAYMENT_METHODS: Array<{
  value: PaymentMethod;
  label: string;
}> = [
  { value: "CASH", label: "نقدي" },
];

/**
 * Reserved digital methods — documented for the UI copy that explains
 * why they are disabled (Option B: verification workflow, see
 * PRE-LAUNCH_HARDENING_PLAN §5.3).
 */
export const RESERVED_PAYMENT_METHODS: Array<{
  value: PaymentMethod;
  label: string;
}> = [
  { value: "CARD", label: "بطاقة" },
  { value: "BANKAK", label: "بنكك" },
  { value: "MTN_MOMO", label: "موبايل MTN" },
  { value: "ZAIN_CASH", label: "زين كاش" },
  { value: "BANK_TRANSFER", label: "تحويل بنكي" },
];

/** Trips sellable from POS: active status AND not yet departed. */
export function isSellable(trip: PosTripCard, now = new Date()): boolean {
  return (
    (trip.status === "SCHEDULED" || trip.status === "OPEN") &&
    new Date(trip.departureAt).getTime() > now.getTime()
  );
}
