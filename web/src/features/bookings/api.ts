import { apiClient } from "@/lib/api-client";
import type {
  Booking,
  BookingFilters,
  CreateBookingInput,
  SeatHoldResponse,
  TripSeatsResponse,
} from "./types";

export function fetchTripSeats(tripId: string): Promise<TripSeatsResponse> {
  return apiClient<TripSeatsResponse>(`/trips/${tripId}/seats`);
}

export function holdSeat(tripId: string, seatId: string): Promise<SeatHoldResponse> {
  return apiClient<SeatHoldResponse>("/bookings/hold", {
    method: "POST",
    body: { tripId, seatId },
  });
}

export function releaseSeat(seatId: string): Promise<{ released: boolean }> {
  return apiClient<{ released: boolean }>("/bookings/release", {
    method: "POST",
    body: { seatId },
  });
}

export function fetchBookings(filters: BookingFilters = {}): Promise<Booking[]> {
  const params = new URLSearchParams();
  if (filters.tripId) params.set("tripId", filters.tripId);
  if (filters.date) params.set("date", filters.date);
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  const query = params.toString();
  return apiClient<Booking[]>(`/bookings${query ? `?${query}` : ""}`);
}

export function createBooking(input: CreateBookingInput, idempotencyKey: string): Promise<Booking> {
  return apiClient<Booking>("/bookings", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: input,
  });
}

export function cancelBooking(id: string, reason: string): Promise<Booking> {
  return apiClient<Booking>(`/bookings/${id}/cancel`, {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: { reason },
  });
}
