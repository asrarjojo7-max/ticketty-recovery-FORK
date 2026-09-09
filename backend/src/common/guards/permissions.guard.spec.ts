import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../decorators/current-user.decorator';
import { PermissionsGuard } from './permissions.guard';

function contextFor(user?: AuthUser): ExecutionContext {
  return {
    getHandler: () => contextFor,
    getClass: () => PermissionsGuard,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const baseUser: AuthUser = {
  sub: 'user-1',
  orgId: 'org-1',
  branchId: null,
  name: 'User',
  email: 'user@example.invalid',
  roleKey: 'TEST',
  permissions: [],
};

describe('PermissionsGuard', () => {
  it.each([
    [['*'], 'bookings.write'],
    [['bookings.*'], 'bookings.write'],
    [['bookings.write'], 'bookings.write'],
  ])('accepts %j for %s', (permissions, required) => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([required]),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(guard.canActivate(contextFor({ ...baseUser, permissions }))).toBe(
      true,
    );
  });

  it('rejects a permission from another domain', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['bookings.write']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(() =>
      guard.canActivate(
        contextFor({ ...baseUser, permissions: ['payments.write'] }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects a missing authenticated user when permission is required', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['bookings.read']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(guard.canActivate(contextFor())).toBe(false);
  });

  it('allows authenticated routes without permission metadata', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(guard.canActivate(contextFor(baseUser))).toBe(true);
  });

  // ─── Go-Live S-1: النجمة لا تعبر نطاق المنصة أبدًا ─────────────

  it('tenant wildcard (*) does NOT grant platform.admin (S-1)', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['platform.admin']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    // مالك Tenant بنجمة "كل شيء داخل منظمتي" — يُرفض من بوابة المنصة
    // على مستوى الحارس نفسه (لا الاعتماد على الفحص الداخلي فقط).
    expect(() =>
      guard.canActivate(contextFor({ ...baseUser, permissions: ['*'] })),
    ).toThrow(ForbiddenException);
  });

  it('explicit platform.admin DOES pass the guard (operator path intact)', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['platform.admin']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(
      guard.canActivate(
        contextFor({ ...baseUser, permissions: ['platform.admin'] }),
      ),
    ).toBe(true);
  });

  it('no permission string combination escalates into platform.admin', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['platform.admin']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    // حتى تركيبات النجمة النطاقية لا تُنتجها — لا طريق اشتقاق
    const attempted: string[][] = [
      ['platform.*'],
      ['*.*'],
      ['platform.admin.*'],
      ['bookings.*', 'platform.read'],
      ['*', 'platform.read'],
    ];
    for (const perms of attempted) {
      expect(() =>
        guard.canActivate(contextFor({ ...baseUser, permissions: perms })),
      ).toThrow(ForbiddenException);
    }
  });

  it('tenant wildcard still grants its own org-domain permissions (no regression)', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['bookings.write']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(
      guard.canActivate(contextFor({ ...baseUser, permissions: ['*'] })),
    ).toBe(true);
  });
});
