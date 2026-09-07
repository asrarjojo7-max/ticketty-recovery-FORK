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

export const PAYMENT_METHODS: Array<{
  value: PaymentMethod;
  label: string;
}> = [
  { value: "CASH", label: "نقدي" },
  { value: "CARD", label: "بطاقة" },
  { value: "BANKAK", label: "بنكك" },
  { value: "MTN_MOMO", label: "موبايل MTN" },
  { value: "ZAIN_CASH", label: "زين كاش" },
  { value: "BANK_TRANSFER", label: "تحويل بنكي" },
];

/** Trips sellable from POS: only these statuses accept holds/bookings. */
export function isSellable(trip: PosTripCard): boolean {
  return trip.status === "SCHEDULED" || trip.status === "OPEN";
}
