export interface TicketBrandingSettings {
  tagline: string | null;
  primaryColor: string;
  secondaryColor: string;
  checkInMinutes: number;
  baggagePieces: number;
  logoMime: string | null;
  logoBytes: number | null;
  logoSha256: string | null;
  logoUrl: string | null;
  busImageMime: string | null;
  busImageBytes: number | null;
  busImageSha256: string | null;
  busImageUrl: string | null;
  updatedAt?: string;
}

export interface OrganizationSettings {
  id: string;
  name: string;
  slug: string;
  currency: string;
  phone: string | null;
  address: string | null;
  ticketTerms: string | null;
  cancellationFeePercent: string;
  active: boolean;
  ticketBranding: TicketBrandingSettings;
}

export interface Branch {
  id: string;
  name: string;
  city: string;
  phone: string | null;
  _count: { users: number; trips: number };
}

export interface Role {
  id: string;
  key: string;
  nameAr: string;
  nameEn: string;
  permissions: string[];
  isSystem: boolean;
  _count: { users: number };
}

export interface SystemUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  createdAt: string;
  branch: Branch | null;
  role: Role;
}

export interface UserInput {
  name: string;
  email: string;
  phone?: string;
  password: string;
  roleId: string;
  branchId?: string;
}

export interface OrganizationInput {
  name?: string;
  phone?: string;
  address?: string;
  ticketTerms?: string;
  cancellationFeePercent?: number;
}

export interface TicketBrandingInput {
  tagline?: string;
  primaryColor?: string;
  secondaryColor?: string;
  checkInMinutes?: number;
  baggagePieces?: number;
}

export type TicketBrandAssetKind = "logo" | "bus";
