"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchTenants, provisionTenant } from "./api";
import type { ProvisionTenantInput } from "./types";

const root = ["platform"] as const;

/** قائمة الـ Tenants — لوحة حية تتحدث كل 30 ثانية (مشغّل المنصة يراقب المبيعات). */
export const useTenants = (search?: string) =>
  useQuery({
    queryKey: [...root, "tenants", search ?? ""],
    queryFn: () => fetchTenants(search),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

export function useProvisionTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProvisionTenantInput) => provisionTenant(input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: root }),
  });
}
