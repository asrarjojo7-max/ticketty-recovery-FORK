import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';

const user = {
  id: 'user-1',
  organizationId: 'org-1',
  branchId: null,
  name: 'Owner',
  email: 'owner@example.com',
  active: true,
  roleKey: 'OWNER',
  permissions: ['*'],
  organizationActive: true,
  passwordChangedAt: new Date('2026-09-12T12:00:00.900Z'),
  mustChangePassword: true,
  subscriptionStatus: 'ACTIVE',
  subscriptionPeriodEnd: new Date('2026-10-12T00:00:00Z'),
};

function contextFor(request: {
  headers: Record<string, string>;
  user?: unknown;
}) {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard credential version', () => {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(false),
  } as unknown as Reflector;
  const findAuthUserById = jest.fn().mockResolvedValue(user);
  const prisma = { findAuthUserById } as unknown as PrismaService;

  beforeEach(() => jest.clearAllMocks());

  it('accepts a token bound to the exact password timestamp', async () => {
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: user.id,
        credentialChangedAt: user.passwordChangedAt.getTime(),
      }),
    } as unknown as JwtService;
    const request = { headers: { authorization: 'Bearer valid-token' } };

    await expect(
      new JwtAuthGuard(jwt, reflector, prisma).canActivate(contextFor(request)),
    ).resolves.toBe(true);
    expect(request).toHaveProperty('user');
  });

  it('rejects an old token even when issued in the same second', async () => {
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: user.id,
        credentialChangedAt: new Date('2026-09-12T12:00:00.100Z').getTime(),
        iat: Math.floor(user.passwordChangedAt.getTime() / 1000),
      }),
    } as unknown as JwtService;
    const request = { headers: { authorization: 'Bearer stale-token' } };

    await expect(
      new JwtAuthGuard(jwt, reflector, prisma).canActivate(contextFor(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects pre-upgrade tokens without a credential version', async () => {
    const jwt = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: user.id }),
    } as unknown as JwtService;
    const request = { headers: { authorization: 'Bearer legacy-token' } };

    await expect(
      new JwtAuthGuard(jwt, reflector, prisma).canActivate(contextFor(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
