export interface PlatformTenant {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  createdAt: string;
  _count: {
    users: number;
    branches: number;
    trips: number;
    tickets: number;
  };
  subscription:
    | {
        planKey: string;
        status: string;
        currentPeriodEnd: string;
        priceSdg: number;
      }
    | null;
}

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

export interface PlatformHealth {
  tenantsTotal: number;
  tenantsActive: number;
  tenantsSuspended: number;
  trialsRunning: number;
  trialsExpiringSoon: number;
  subscriptionsActive: number;
  subscriptionsExpired: number;
  pendingAccountingEvents: number;
  unacknowledgedEvents: number;
  databaseSize: string;
}

export interface PlatformSystemEvent {
  id: string;
  level: string;
  category: string;
  message: string;
  context: Record<string, unknown> | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface PlatformTenantReport {
  organizationId: string;
  organizationName: string;
  tripsTotal: number;
  tripsRecent: number;
  ticketsTotal: number;
  ticketsRecent: number;
  revenueTotalSdg: number;
  revenueRecentSdg: number;
  activeUsers: number;
  branches: number;
  buses: number;
  lastActivity: string | null;
}

export interface PlatformSubscription {
  subscriptionId: string;
  organizationId: string;
  planKey: string;
  priceSdg: number;
  status: string;
  startedAt: string;
  currentPeriodEnd: string;
}

export interface BackupRunbook {
  frequency: string;
  tool: string;
  command: string;
  retention: string;
  restoreDrill: string;
  encryption: string;
  note: string;
}
