import { apiClient } from "@/lib/api-client";
import type {
  PlatformTenant,
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
