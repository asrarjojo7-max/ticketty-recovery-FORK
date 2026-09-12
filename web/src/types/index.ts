// ─── Session & shared types ────────────────────────────────────
export interface SessionUser {
  sub: string;
  orgId: string | null;
  branchId: string | null;
  name: string;
  email: string;
  roleKey: string;
  permissions: string[];
  mustChangePassword: boolean;
}
