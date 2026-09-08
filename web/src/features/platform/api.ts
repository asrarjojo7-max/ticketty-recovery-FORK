import { apiClient } from "@/lib/api-client";
import type {
  BackupRunbook,
  PlatformHealth,
  PlatformSubscription,
  PlatformSystemEvent,
  PlatformTenant,
  PlatformTenantReport,
  ProvisionTenantInput,
  ProvisionedTenant,
} from "./types";

export const fetchTenants = (search?: string) =>
  apiClient<PlatformTenant[]>(
    `/platform/tenants${search ? `?search=${encodeURIComponent(search)}` : ""}`,
  );

export const provisionTenant = (input: ProvisionTenantInput) =>
  apiClient<ProvisionedTenant>("/platform/tenants", {
    method: "POST",
    body: input,
  });

export const suspendTenant = (orgId: string, reason: string) =>
  apiClient<{ organizationId: string; active: boolean }>(
    `/platform/tenants/${orgId}/suspend`,
    { method: "POST", body: { reason } },
  );

export const reactivateTenant = (orgId: string) =>
  apiClient<{ organizationId: string; active: boolean }>(
    `/platform/tenants/${orgId}/reactivate`,
    { method: "POST" },
  );

export const setSubscription = (
  orgId: string,
  planKey: "TRIAL" | "MONTHLY" | "YEARLY",
) =>
  apiClient<PlatformSubscription>(
    `/platform/tenants/${orgId}/subscription`,
    { method: "POST", body: { planKey, organizationId: orgId } },
  );

export const renewSubscription = (orgId: string, months: 1 | 12) =>
  apiClient<PlatformSubscription>(
    `/platform/tenants/${orgId}/subscription/renew`,
    { method: "POST", body: { months } },
  );

export const fetchHealth = () =>
  apiClient<PlatformHealth>("/platform/health");

export const fetchEvents = (level?: string) =>
  apiClient<PlatformSystemEvent[]>(
    `/platform/events${level ? `?level=${level}` : ""}`,
  );

export const acknowledgeEvent = (eventId: string) =>
  apiClient<{ id: string; acknowledgedAt: string }>(
    `/platform/events/${eventId}/acknowledge`,
    { method: "POST" },
  );

export const fetchTenantReport = (orgId: string, days?: number) =>
  apiClient<PlatformTenantReport>(
    `/platform/tenants/${orgId}/report${days ? `?days=${days}` : ""}`,
  );

export const fetchBackupRunbook = () =>
  apiClient<BackupRunbook>("/platform/backup/runbook");
