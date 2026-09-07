import { apiClient } from "@/lib/api-client";
import type { Trip } from "@/features/trips";
import type {
  Booking,
  CreateBookingInput,
  TripSeat,
  TripSeatsResponse,
} from "@/features/bookings";

/**
 * POS feature API — thin wrapper over existing endpoints.
 * Money handling: seat prices arrive from the backend as strings (Decimal);
 * the POS only SUMS them for display. Totals that matter are computed and
 * persisted server-side at booking creation.
 */

export type PosTripCard = Pick<
  Trip,
  "id" | "departureAt" | "status" | "route" | "bus" | "_count"
>;

/** Trips available for sale today onward: SCHEDULED/OPEN only. */
export function fetchPosTrips(date?: string): Promise<PosTripCard[]> {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  return apiClient<PosTripCard[]>(`/trips?${params.toString()}`);
}

export function fetchPosTripSeats(tripId: string): Promise<TripSeatsResponse> {
  return apiClient<TripSeatsResponse>(`/trips/${tripId}/seats`);
}

export function holdPosSeat(
  tripId: string,
  seatId: string,
): Promise<{ held: true; seatId: string; expiresAt: string }> {
  return apiClient("/bookings/hold", {
    method: "POST",
    body: { tripId, seatId },
  });
}

export function releasePosSeat(
  seatId: string,
): Promise<{ released: boolean }> {
  return apiClient("/bookings/release", {
    method: "POST",
    body: { seatId },
  });
}

export function createPosBooking(
  input: CreateBookingInput,
  idempotencyKey: string,
): Promise<Booking> {
  return apiClient<Booking>("/bookings", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: input,
  });
}

/** Simple seat display-price helper (display only, no business math). */
export function seatDisplayPrice(seat: TripSeat): number {
  return Number(seat.price);
}
