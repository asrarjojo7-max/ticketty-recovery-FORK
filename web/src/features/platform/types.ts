export interface ProvisionedTenant {
  organization: {
    id: string;
    name: string;
    slug: string;
    active: boolean;
    createdAt: string;
  };
  owner: {
    id: string;
    name: string;
    email: string;
    roleKey: string;
    active: boolean;
    mustChangePassword: true;
  };
  primaryBranch: {
    id: string;
    name: string;
    city: string;
  };
}

export interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  createdAt: string;
  _count: { users: number; branches: number; trips: number };
}

export interface ProvisionTenantInput {
  name: string;
  slug: string;
  ownerEmail: string;
  ownerName: string;
  initialPassword: string;
  primaryBranchName?: string;
  primaryBranchCity?: string;
  organizationPhone?: string;
}
