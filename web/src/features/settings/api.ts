import { apiClient } from "@/lib/api-client";
import type {
  Branch,
  OrganizationInput,
  OrganizationSettings,
  Role,
  SystemUser,
  TicketBrandAssetKind,
  TicketBrandingInput,
  UserInput,
} from "./types";

const BFF_BASE = "/api/proxy";

export const fetchOrganization = () =>
  apiClient<OrganizationSettings>("/administration/organization");

export const updateOrganization = (input: OrganizationInput) =>
  apiClient<OrganizationSettings>("/administration/organization", {
    method: "PATCH",
    body: input,
  });

export const updateTicketBranding = (input: TicketBrandingInput) =>
  apiClient<OrganizationSettings>("/administration/organization/ticket-branding", {
    method: "PATCH",
    body: input,
  });

export async function uploadTicketBrandAsset(
  kind: TicketBrandAssetKind,
  file: File,
): Promise<OrganizationSettings> {
  const body = new FormData();
  body.set("file", file);
  const response = await fetch(
    `${BFF_BASE}/administration/organization/ticket-branding/assets/${kind}`,
    { method: "POST", body, credentials: "include" },
  );
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(error.message ?? "تعذر رفع صورة الهوية");
  }
  return response.json() as Promise<OrganizationSettings>;
}

export const deleteTicketBrandAsset = (kind: TicketBrandAssetKind) =>
  apiClient<OrganizationSettings>(
    `/administration/organization/ticket-branding/assets/${kind}`,
    { method: "DELETE" },
  );

export const fetchBranches = () =>
  apiClient<Branch[]>("/administration/branches");
export const createBranch = (input: { name: string; city: string; phone?: string }) =>
  apiClient<Branch>("/administration/branches", { method: "POST", body: input });
export const fetchRoles = () => apiClient<Role[]>("/administration/roles");
export const fetchUsers = () => apiClient<SystemUser[]>("/administration/users");
export const createUser = (input: UserInput) =>
  apiClient<SystemUser>("/administration/users", { method: "POST", body: input });
export const updateUser = (
  id: string,
  input: Partial<Omit<UserInput, "password">> & { active?: boolean },
) => apiClient<SystemUser>(`/administration/users/${id}`, { method: "PATCH", body: input });
