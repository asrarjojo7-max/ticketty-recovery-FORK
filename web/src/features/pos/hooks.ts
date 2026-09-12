"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createPosBooking,
  fetchPosTripSeats,
  fetchPosTrips,
  holdPosSeat,
  releasePosSeat,
} from "./api";
import type { CreateBookingInput } from "@/features/bookings";
import type { TripSeatsResponse } from "@/features/bookings";
import {
  clearSaleIdempotencyKey,
  idempotencyKeyForSale,
} from "./sale-idempotency";

export const posKeys = {
  trips: (date?: string) => ["pos", "trips", date ?? "all"] as const,
  seats: (tripId: string) => ["trip-seats", tripId] as const,
};

/** Today+future sellable trips. */
export function usePosTrips(date?: string) {
  return useQuery({
    queryKey: posKeys.trips(date),
    queryFn: () => fetchPosTrips(date),
    refetchInterval: 30_000,
  });
}

export function usePosTripSeats(tripId: string | null) {
  return useQuery({
    queryKey: posKeys.seats(tripId ?? "none"),
    queryFn: () => fetchPosTripSeats(tripId as string),
    enabled: Boolean(tripId),
    staleTime: 5_000,
    refetchInterval: 15_000,
    select: (data: TripSeatsResponse) => data,
  });
}

/**
 * Hold a seat for the current seller. On 409 (someone else holds it) we
 * invalidate the seat map so the seller sees the fresh state immediately.
 */
export function useHoldPosSeat(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (seatId: string) => holdPosSeat(tripId, seatId),
    onError: (error) => {
      toast.error("المقعد محجوز لمستخدم آخر", {
        description: error instanceof Error ? error.message : undefined,
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: posKeys.seats(tripId) }),
  });
}

export function useReleasePosSeat(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (seatId: string) => releasePosSeat(seatId),
    onSettled: () => qc.invalidateQueries({ queryKey: posKeys.seats(tripId) }),
  });
}

/**
 * Checkout keeps one Idempotency-Key for the logical sale until a definitive
 * success arrives. Timeouts, response loss, React Query retries, and page
 * reloads therefore replay the original server operation instead of selling
 * the same seat twice under a fresh key.
 */
export function useCheckout(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBookingInput) =>
      createPosBooking(input, await idempotencyKeyForSale(input)),
    onSuccess: (_booking, input) => {
      void clearSaleIdempotencyKey(input);
      toast.success("تم إتمام البيع بنجاح");
      qc.invalidateQueries({ queryKey: posKeys.seats(tripId) });
      qc.invalidateQueries({ queryKey: ["pos"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (error) => {
      toast.error("تعذّر إتمام البيع", {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });
}
