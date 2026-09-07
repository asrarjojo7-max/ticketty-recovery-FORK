"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createBus,
  createDriver,
  createSeatTemplate,
  fetchBuses,
  fetchDrivers,
  fetchSeatTemplates,
  updateBus,
  updateDriver,
} from "../api";
import type { Bus, Driver, SeatTemplate } from "../types";
import type {
  CreateBusInput,
  CreateDriverInput,
  CreateSeatTemplateInput,
  DriverStatus,
  UpdateBusInput,
  UpdateDriverInput,
} from "../types";

const fleetKeys = {
  buses: ["fleet", "buses"] as const,
  templates: ["fleet", "seat-templates"] as const,
  drivers: ["fleet", "drivers"] as const,
};

export const useBuses = () =>
  useQuery({ queryKey: fleetKeys.buses, queryFn: fetchBuses, staleTime: 30_000 });

export const useSeatTemplates = () =>
  useQuery({
    queryKey: fleetKeys.templates,
    queryFn: fetchSeatTemplates,
    staleTime: 60_000,
  });

export function useDrivers(search = "", status?: DriverStatus) {
  return useQuery({
    queryKey: [...fleetKeys.drivers, search, status],
    queryFn: () => fetchDrivers(search, status),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

function toastError(error: unknown) {
  toast.error("تعذّر إتمام العملية", {
    description: error instanceof Error ? error.message : undefined,
  });
}

export function useCreateBus() {
  const q = useQueryClient();
  return useMutation<Bus, Error, CreateBusInput>({
    mutationFn: (input) => createBus(input),
    onSuccess: () => {
      toast.success("تمت إضافة الحافلة إلى الأسطول");
      q.invalidateQueries({ queryKey: fleetKeys.buses });
    },
    onError: toastError,
  });
}

export function useUpdateBus() {
  const q = useQueryClient();
  return useMutation<Bus, Error, { id: string; input: UpdateBusInput }>({
    mutationFn: ({ id, input }) => updateBus(id, input),
    onSuccess: () => {
      toast.success("تم تحديث بيانات الحافلة");
      q.invalidateQueries({ queryKey: fleetKeys.buses });
    },
    onError: toastError,
  });
}

export function useCreateDriver() {
  const q = useQueryClient();
  return useMutation<Driver, Error, CreateDriverInput>({
    mutationFn: (input) => createDriver(input),
    onSuccess: () => {
      toast.success("تمت إضافة السائق");
      q.invalidateQueries({ queryKey: fleetKeys.drivers });
    },
    onError: toastError,
  });
}

export function useUpdateDriver() {
  const q = useQueryClient();
  return useMutation<Driver, Error, { id: string; input: UpdateDriverInput }>({
    mutationFn: ({ id, input }) => updateDriver(id, input),
    onSuccess: () => {
      toast.success("تم تحديث بيانات السائق");
      q.invalidateQueries({ queryKey: fleetKeys.drivers });
    },
    onError: toastError,
  });
}

export function useCreateSeatTemplate() {
  const q = useQueryClient();
  return useMutation<SeatTemplate, Error, CreateSeatTemplateInput>({
    mutationFn: (input) => createSeatTemplate(input),
    onSuccess: () => {
      toast.success("تم إنشاء قالب المقاعد");
      q.invalidateQueries({ queryKey: fleetKeys.templates });
    },
    onError: toastError,
  });
}
