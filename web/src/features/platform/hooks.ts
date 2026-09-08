"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acknowledgeEvent,
  fetchBackupRunbook,
  fetchEvents,
  fetchHealth,
  fetchTenantReport,
  fetchTenants,
  provisionTenant,
  reactivateTenant,
  renewSubscription,
  setSubscription,
  suspendTenant,
} from "./api";
import type { ProvisionTenantInput } from "./types";

const root = ["platform"] as const;

/** لوحة حية: قائمة الـ Tenants — تحديث تلقائي كل 30 ثانية. */
export const useTenants = (search?: string) =>
  useQuery({
    queryKey: [...root, "tenants", search ?? ""],
    queryFn: () => fetchTenants(search),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

/** صحة المنصة — بطاقة القيادة، تحديث كل 20 ثانية. */
export const useHealth = () =>
  useQuery({
    queryKey: [...root, "health"],
    queryFn: fetchHealth,
    refetchInterval: 20_000,
  });

/** أحداث النظام — إشعارات وتنبيهات وأخطاء، تحديث كل 25 ثانية. */
export const useEvents = (level?: string) =>
  useQuery({
    queryKey: [...root, "events", level ?? ""],
    queryFn: () => fetchEvents(level),
    refetchInterval: 25_000,
  });

export const useTenantReport = (orgId: string | null) =>
  useQuery({
    queryKey: [...root, "report", orgId],
    queryFn: () => fetchTenantReport(orgId as string),
    enabled: Boolean(orgId),
  });

export const useBackupRunbook = () =>
  useQuery({
    queryKey: [...root, "backup"],
    queryFn: fetchBackupRunbook,
    staleTime: 10 * 60_000,
  });

export function useProvisionTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProvisionTenantInput) => provisionTenant(input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: root }),
  });
}

export function useSuspendTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, reason }: { orgId: string; reason: string }) =>
      suspendTenant(orgId, reason),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: root }),
  });
}

export function useReactivateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orgId: string) => reactivateTenant(orgId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: root }),
  });
}

export function useSetSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orgId,
      planKey,
    }: {
      orgId: string;
      planKey: "TRIAL" | "MONTHLY" | "YEARLY";
    }) => setSubscription(orgId, planKey),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: root }),
  });
}

export function useRenewSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, months }: { orgId: string; months: 1 | 12 }) =>
      renewSubscription(orgId, months),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: root }),
  });
}

export function useAcknowledgeEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => acknowledgeEvent(eventId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: root }),
  });
}
