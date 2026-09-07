import { apiClient } from "@/lib/api-client";
import type {
  BusSummary,
  CreateRouteInput,
  CreateTripInput,
  TransportRoute,
  Trip,
  TripFilters,
  UpdateRouteInput,
  UpdateTripInput,
} from "./types";

function queryString(params: Record<string, string | undefined>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) searchParams.set(key, value);
  });
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export function fetchTrips(filters: TripFilters = {}): Promise<Trip[]> {
  return apiClient<Trip[]>(
    `/trips${queryString({
      date: filters.date,
      routeId: filters.routeId,
      status: filters.status,
      ...(filters.page ? { page: String(filters.page) } : {}),
      ...(filters.limit ? { limit: String(filters.limit) } : {}),
    })}`,
  );
}

export function fetchRoutes(search?: string): Promise<TransportRoute[]> {
  return apiClient<TransportRoute[]>(
    `/routes${queryString({ search: search?.trim() })}`,
  );
}

export function fetchBuses(): Promise<BusSummary[]> {
  return apiClient<BusSummary[]>("/buses");
}

export function createTrip(input: CreateTripInput): Promise<Trip> {
  return apiClient<Trip>("/trips", { method: "POST", body: input });
}

export function createRoute(input: CreateRouteInput): Promise<TransportRoute> {
  return apiClient<TransportRoute>("/routes", { method: "POST", body: input });
}

export function updateRoute(id: string, input: UpdateRouteInput): Promise<TransportRoute> {
  return apiClient<TransportRoute>(`/routes/${id}`, { method: "PATCH", body: input });
}

export function cancelTrip(id: string, reason: string): Promise<{ trip: Trip; affectedBookings: number; refundsCount: number }> {
  return apiClient(`/trips/${id}/cancel`, {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: { reason },
  });
}

export function updateTrip(id: string, input: UpdateTripInput): Promise<Trip> {
  return apiClient<Trip>(`/trips/${id}`, { method: "PATCH", body: input });
}
