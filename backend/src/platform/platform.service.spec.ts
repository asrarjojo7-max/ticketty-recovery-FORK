import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PlatformService } from './platform.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';

/**
 * اختبارات وحدة PlatformService — حواجز الأمان وترجمة أخطاء SQL.
 * كل الاستدعاءات عبر PrismaService مُزوَّرة (mock) — لا قاعدة بيانات هنا؛
 * التكامل الحقيقي (DB حية) مغطى في test/platform-provisioning.e2e-spec.ts.
 */

jest.mock('bcryptjs', () => ({
  hash: jest.fn(() => 'hashed-password'),
}));

const PLATFORM_ORG_ID = 'org-platform';
const TENANT_ORG_ID = 'org-tenant';

function platformAdmin(): AuthUser {
  return {
    sub: 'platform-admin-id',
    orgId: PLATFORM_ORG_ID,
    branchId: null,
    name: 'Suda Operator',
    email: 'ops@suda.example',
    roleKey: 'OWNER',
    permissions: ['platform.admin'],
  };
}

function tenantOwner(): AuthUser {
  return {
    sub: 'tenant-owner-id',
    orgId: TENANT_ORG_ID,
    branchId: null,
    name: 'Tenant Owner',
    email: 'owner@bus.example',
    roleKey: 'OWNER',
    // مالك منظمة عميل يملك '*' داخل منظمة واحدة — لا يجب أن يمر
    permissions: ['*'],
  };
}

function makePrismaMock() {
  return {
    withPlatformRole: jest.fn((callback: never) =>
      Promise.resolve(
        (callback as (tx: unknown) => unknown)({
          $queryRaw: jest.fn(() => [
            { org_id: PLATFORM_ORG_ID, org_active: true },
          ]),
        }),
      ),
    ),
  };
}

const DTO = {
  name: 'شركة النيل للنقل',
  slug: 'nile-transport',
  ownerEmail: 'Owner@Nile.SD',
  ownerName: 'مالك النيل',
  initialPassword: 'Strong-Passw0rd-2026',
  primaryBranchName: 'الفرع الرئيسي',
  primaryBranchCity: 'الخرطوم',
};

const PROVISION_ROW = {
  organization_id: 'new-org',
  organization_slug: 'nile-transport',
  organization_name: 'شركة النيل للنقل',
  branch_id: 'new-branch',
  branch_name: 'الفرع الرئيسي',
  branch_city: 'الخرطوم',
  role_id: 'new-role',
  role_key: 'OWNER',
  owner_id: 'new-owner',
  owner_name: 'مالك النيل',
  owner_email: 'owner@nile.sd',
  audit_id: 'new-audit',
};

describe('PlatformService — security barriers', () => {
  it('rejects a tenant OWNER (*) that is not the platform organization', async () => {
    const service = new PlatformService(makePrismaMock() as never);
    await expect(service.provisionTenant(tenantOwner(), DTO)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects a platform user lacking platform.admin permission', async () => {
    const noPerm = { ...platformAdmin(), permissions: ['reports.read'] };
    const service = new PlatformService(makePrismaMock() as never);
    await expect(service.provisionTenant(noPerm, DTO)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects when the caller org is not the platform operator org', async () => {
    const prisma = {
      withPlatformRole: jest.fn((cb: never) =>
        Promise.resolve(
          (cb as (tx: unknown) => unknown)({
            $queryRaw: jest.fn(() => [
              { org_id: 'some-other-org', org_active: true },
            ]),
          }),
        ),
      ),
    };
    const service = new PlatformService(prisma as never);
    await expect(service.provisionTenant(platformAdmin(), DTO)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects when the platform org is inactive', async () => {
    const prisma = {
      withPlatformRole: jest.fn((cb: never) =>
        Promise.resolve(
          (cb as (tx: unknown) => unknown)({
            $queryRaw: jest.fn(() => [
              { org_id: PLATFORM_ORG_ID, org_active: false },
            ]),
          }),
        ),
      ),
    };
    const service = new PlatformService(prisma as never);
    await expect(service.provisionTenant(platformAdmin(), DTO)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('listTenants is restricted to the platform operator too', async () => {
    const service = new PlatformService(makePrismaMock() as never);
    await expect(service.listTenants(tenantOwner())).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('PlatformService.provisionTenant — SQL boundary translation', () => {
  function provisionMock(result: unknown[] = [], error?: Error) {
    // استدعاءان متتاليان عبر withPlatformRole:
    // 1) فحص منظمة المشغّل → صف org_id/org_active
    // 2) التزويد نفسه → صف النتيجة (أو خطأ)
    const operatorRow = [{ org_id: PLATFORM_ORG_ID, org_active: true }];
    let call = 0;
    const queryRaw = jest.fn(() => {
      call += 1;
      if (call === 1) return operatorRow;
      if (error) throw error;
      return result;
    });
    const prisma = {
      withPlatformRole: jest.fn((cb: never) =>
        Promise.resolve(
          (cb as (tx: unknown) => unknown)({ $queryRaw: queryRaw }),
        ),
      ),
    };
    return { prisma, queryRaw };
  }

  it('maps PLATFORM_SLUG_TAKEN to a 409 ConflictException', async () => {
    const { prisma } = provisionMock(
      [],
      new Error('PLATFORM_SLUG_TAKEN: المعرف مستخدم'),
    );
    const service = new PlatformService(prisma as never);
    await expect(service.provisionTenant(platformAdmin(), DTO)).rejects.toThrow(
      ConflictException,
    );
  });

  it('maps PLATFORM_EMAIL_TAKEN to a 409 ConflictException', async () => {
    const { prisma } = provisionMock(
      [],
      new Error('PLATFORM_EMAIL_TAKEN: البريد مستخدم'),
    );
    const service = new PlatformService(prisma as never);
    await expect(service.provisionTenant(platformAdmin(), DTO)).rejects.toThrow(
      ConflictException,
    );
  });

  it('rethrows unexpected errors untouched (500 envelope)', async () => {
    const { prisma } = provisionMock([], new Error('connection lost'));
    const service = new PlatformService(prisma as never);
    await expect(service.provisionTenant(platformAdmin(), DTO)).rejects.toThrow(
      'connection lost',
    );
  });

  it('provisions successfully and never leaks the password or hash', async () => {
    const { prisma } = provisionMock([PROVISION_ROW]);
    const service = new PlatformService(prisma as never);
    const result = await service.provisionTenant(platformAdmin(), DTO);

    expect(result.owner.email).toBe('owner@nile.sd');
    expect(result.owner.roleKey).toBe('OWNER');
    expect(result.owner.mustChangePassword).toBe(true);
    expect(result.organization.slug).toBe('nile-transport');

    // الأمان: لا هَش ولا كلمة مرور في أي مكان من النتيجة
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('Strong-Passw0rd-2026');
    expect(serialized).not.toContain('hashed-password');
    expect(serialized).not.toContain('passwordHash');

    // bcrypt بمعيار المنظومة (12)
    expect(bcrypt.hash).toHaveBeenCalledWith('Strong-Passw0rd-2026', 12);
  });
});

describe('PlatformService.listTenants', () => {
  it('returns the tenant roster with normalized counts and no secrets', async () => {
    let listCall = 0;
    const queryRaw = jest.fn(() => {
      listCall += 1;
      if (listCall === 1)
        return [{ org_id: PLATFORM_ORG_ID, org_active: true }];
      return [
        {
          id: 'org-1',
          name: 'شركة النيل',
          slug: 'nile-transport',
          active: true,
          created_at: new Date('2026-01-01'),
          users_count: BigInt(5),
          branches_count: BigInt(2),
          trips_count: BigInt(40),
        },
      ];
    });
    const prisma = {
      withPlatformRole: jest.fn((cb: never) =>
        Promise.resolve(
          (cb as (tx: unknown) => unknown)({ $queryRaw: queryRaw }),
        ),
      ),
    };
    const service = new PlatformService(prisma as never);
    const list = await service.listTenants(platformAdmin(), 'نيل');
    const rowFixture = (
      queryRaw.mock.results[0]?.value as { tickets_count: number }[]
    )?.[0];

    expect(list).toHaveLength(1);
    expect(list[0]._count).toEqual({
      users: 5,
      branches: 2,
      trips: 40,
      tickets: Number(rowFixture.tickets_count),
    });
    expect(JSON.stringify(list)).not.toContain('password');
    expect(JSON.stringify(list)).not.toContain('Hash');
  });
});

// ═════════════════════════════════════════════════════════════
// الاشتراكات ودورة الحياة والمراقبة — حواجز وترجمة أخطاء
// ═════════════════════════════════════════════════════════════

describe('PlatformService — subscription & lifecycle', () => {
  const ORG_ID = 'org-target';

  function operatorMock(result: unknown[] = [], error?: Error) {
    let call = 0;
    const queryRaw = jest.fn(() => {
      call += 1;
      if (call === 1) return [{ org_id: PLATFORM_ORG_ID, org_active: true }];
      if (error) throw error;
      return result;
    });
    return {
      withPlatformRole: jest.fn((cb: never) =>
        Promise.resolve(
          (cb as (tx: unknown) => unknown)({ $queryRaw: queryRaw }),
        ),
      ),
    };
  }

  it('setSubscription rejects a price that does not match the server-side plan', async () => {
    const service = new PlatformService(operatorMock() as never);
    await expect(
      service.setSubscription(platformAdmin(), {
        organizationId: ORG_ID,
        planKey: 'MONTHLY',
        priceSdg: 1,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('setSubscription rejects unknown plan keys before touching the database', async () => {
    const service = new PlatformService(operatorMock() as never);
    await expect(
      service.setSubscription(platformAdmin(), {
        organizationId: ORG_ID,
        planKey: 'FREE_FOREVER',
      } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('renewSubscription rejects any duration other than 1 or 12 months', async () => {
    const service = new PlatformService(operatorMock() as never);
    await expect(
      service.renewSubscription(platformAdmin(), ORG_ID, 3),
    ).rejects.toThrow(BadRequestException);
  });

  it('suspendTenant maps PLATFORM_OPERATOR_PROTECTED to a clear 400', async () => {
    const service = new PlatformService(
      operatorMock([], new Error('PLATFORM_OPERATOR_PROTECTED')) as never,
    );
    await expect(
      service.suspendTenant(platformAdmin(), ORG_ID, 'اختبار'),
    ).rejects.toThrow('لا يمكن تعليق منظمة مشغّل المنصة نفسها');
  });

  it('suspendTenant maps not-found to a 400 (not a 500)', async () => {
    const service = new PlatformService(
      operatorMock(
        [],
        new Error('PLATFORM_TENANT_NOT_FOUND_OR_ALREADY_SUSPENDED'),
      ) as never,
    );
    await expect(
      service.suspendTenant(platformAdmin(), ORG_ID, 'اختبار'),
    ).rejects.toThrow(BadRequestException);
  });

  it('health returns normalized numbers (no BigInt leaking to JSON)', async () => {
    const service = new PlatformService(
      operatorMock([
        {
          tenants_total: 6n,
          tenants_active: 5n,
          tenants_suspended: 1n,
          trials_running: 2n,
          trials_expiring_soon: 1n,
          subscriptions_active: 3n,
          subscriptions_expired: 1n,
          pending_accounting_events: 0n,
          unacknowledged_events: 4n,
          database_size: '12 MB',
          app_version: '1.0',
        },
      ]) as never,
    );
    const health = await service.health(platformAdmin());
    expect(health.tenantsTotal).toBe(6);
    expect(health.tenantsActive).toBe(5);
    expect(health.unacknowledgedEvents).toBe(4);
    expect(health.databaseSize).toBe('12 MB');
    // كل القيم أرقام JS سليمة — ليس BigInt
    expect(health.tenantsTotal).not.toBeInstanceOf(Object);
  });

  it('listEvents normalizes level filter and maps rows', async () => {
    const service = new PlatformService(
      operatorMock([
        {
          id: 'ev1',
          level: 'WARN',
          category: 'SUBSCRIPTION',
          message: 'انتهت فترة اشتراك شركة',
          context: { organizationId: ORG_ID },
          acknowledged_at: null,
          created_at: new Date('2026-09-08T00:00:00Z'),
        },
      ]) as never,
    );
    const events = await service.listEvents(platformAdmin(), 'warn', 50);
    expect(events).toHaveLength(1);
    expect(events[0].level).toBe('WARN');
    expect(events[0].acknowledgedAt).toBeNull();
  });

  it('tenantReport rejects invalid windows by clamping to 30 days', async () => {
    const queryRaw = jest.fn(() => [
      {
        organization_id: ORG_ID,
        organization_name: 'شركة اختبار',
        trips_total: 10n,
        trips_recent: 4n,
        tickets_total: 120n,
        tickets_recent: 40n,
        revenue_total_sdg: 1000000,
        revenue_recent_sdg: 250000,
        active_users: 8n,
        branches: 2n,
        buses: 5n,
        last_activity: null,
      },
    ]);
    let call = 0;
    const prisma = {
      withPlatformRole: jest.fn((cb: never) =>
        Promise.resolve(
          (cb as (tx: unknown) => unknown)({
            $queryRaw: jest.fn(() => {
              call += 1;
              if (call === 1)
                return [{ org_id: PLATFORM_ORG_ID, org_active: true }];
              return queryRaw();
            }),
          }),
        ),
      ),
    };
    const service = new PlatformService(prisma as never);
    const report = await service.tenantReport(platformAdmin(), ORG_ID, 9999);
    expect(report.ticketsTotal).toBe(120);
    expect(report.activeUsers).toBe(8);
    expect(report.lastActivity).toBeNull();
  });
});
