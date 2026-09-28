"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cancelTrip, completeTrip, createTrip, fetchTrips, openTrip, updateTrip } from "../api";
import type { CreateTripInput, TripFilters, UpdateTripInput } from "../types";

export const tripKeys = {
  all: ["trips"] as const,
  list: (filters: TripFilters) => [...tripKeys.all, "list", filters] as const,
};

export function useTrips(filters: TripFilters = {}) {
  return useQuery({
    queryKey: tripKeys.list(filters),
    queryFn: () => fetchTrips(filters),
    staleTime: 30_000,
  });
}

export function useCreateTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTripInput) => createTrip(input),
    onSuccess: () => {
      toast.success("تم إنشاء الرحلة بنجاح");
      queryClient.invalidateQueries({ queryKey: tripKeys.all });
    },
    onError: (error) =>
      toast.error("تعذّر إنشاء الرحلة", {
        description: error instanceof Error ? error.message : undefined,
      }),
  });
}

export function useUpdateTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTripInput }) =>
      updateTrip(id, input),
    onSuccess: () => {
      toast.success("تم تحديث الرحلة");
      queryClient.invalidateQueries({ queryKey: tripKeys.all });
    },
    onError: (error) =>
      toast.error("تعذّر تحديث الرحلة", {
        description: error instanceof Error ? error.message : undefined,
      }),
  });
}

export function useOpenTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => openTrip(id),
    onSuccess: () => {
      toast.success("تم فتح الحجز للرحلة");
      queryClient.invalidateQueries({ queryKey: tripKeys.all });
    },
    onError: (error) =>
      toast.error("تعذّر فتح الحجز", {
        description: error instanceof Error ? error.message : undefined,
      }),
  });
}

export function useCompleteTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => completeTrip(id),
    onSuccess: () => {
      toast.success("تم إكمال الرحلة");
      queryClient.invalidateQueries({ queryKey: tripKeys.all });
    },
    onError: (error) =>
      toast.error("تعذّر إكمال الرحلة", {
        description: error instanceof Error ? error.message : undefined,
      }),
  });
}

export function useCancelTrip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelTrip(id, reason),
    onSuccess: () => {
      toast.success("تم إلغاء الرحلة");
      queryClient.invalidateQueries({ queryKey: tripKeys.all });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) =>
      toast.error("تعذّر إلغاء الرحلة", {
        description: error instanceof Error ? error.message : undefined,
      }),
  });
}
