import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const findAuthUserByEmail = jest.fn();
  const recordFailedLogin = jest.fn();
  const recordSuccessfulLogin = jest.fn();
  const createAuditLog = jest.fn();
  const withTenantContext = jest.fn(
    (_orgId: string, callback: () => Promise<unknown>) => callback(),
  );
  const signAsync = jest.fn();
  const prisma = {
    findAuthUserByEmail,
    recordFailedLogin,
    recordSuccessfulLogin,
    withTenantContext,
    auditLog: { create: createAuditLog },
  } as unknown as PrismaService;
  const jwt = { signAsync } as unknown as JwtService;
  const service = new AuthService(prisma, jwt);

  beforeEach(() => {
    jest.clearAllMocks();
    recordFailedLogin.mockResolvedValue(1);
    recordSuccessfulLogin.mockResolvedValue(undefined);
  });

  it('normalizes the email, signs a token, and records the login', async () => {
    const passwordHash = await bcrypt.hash('strong-password', 4);
    findAuthUserByEmail.mockResolvedValue({
      id: 'user-1',
      organizationId: 'org-1',
      branchId: null,
      name: 'مدير النظام',
      email: 'owner@ticketty.sd',
      passwordHash,
      active: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      roleKey: 'OWNER',
      permissions: ['*'],
      organizationActive: true,
      passwordChangedAt: new Date('2026-09-12T12:00:00.123Z'),
      mustChangePassword: true,
    });
    signAsync.mockResolvedValue('signed-token');
    createAuditLog.mockResolvedValue({ id: 'audit-1' });

    const result = await service.login(
      '  OWNER@TICKETTY.SD ',
      'strong-password',
    );

    expect(findAuthUserByEmail).toHaveBeenCalledWith('owner@ticketty.sd');
    expect(recordSuccessfulLogin).toHaveBeenCalledWith('user-1');
    expect(signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'user-1',
        orgId: 'org-1',
        credentialChangedAt: 1_789_214_400_123,
      }),
    );
    expect(withTenantContext).toHaveBeenCalledWith(
      'org-1',
      expect.any(Function),
    );
    expect(createAuditLog).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        userId: 'user-1',
        action: 'AUTH_LOGIN_SUCCEEDED',
        entity: 'User',
        entityId: 'user-1',
      },
    });
    expect(result.access_token).toBe('signed-token');
    expect(result.user.permissions).toEqual(['*']);
    expect(result.user.mustChangePassword).toBe(true);
  });

  it('records a wrong password without signing a token', async () => {
    findAuthUserByEmail.mockResolvedValue({
      id: 'user-1',
      organizationId: 'org-1',
      active: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      passwordHash: await bcrypt.hash('correct-password', 4),
      roleKey: 'OWNER',
      permissions: ['*'],
      organizationActive: true,
    });

    await expect(
      service.login('owner@ticketty.sd', 'wrong-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(recordFailedLogin).toHaveBeenCalledWith('user-1');
    expect(signAsync).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it('rejects a user whose organization is inactive', async () => {
    findAuthUserByEmail.mockResolvedValue({
      organizationId: 'org-1',
      active: true,
      passwordHash: await bcrypt.hash('strong-password', 4),
      roleKey: 'OWNER',
      permissions: ['*'],
      organizationActive: false,
    });

    await expect(
      service.login('owner@ticketty.sd', 'strong-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(signAsync).not.toHaveBeenCalled();
  });

  it('rejects a currently locked user without updating login state', async () => {
    findAuthUserByEmail.mockResolvedValue({
      id: 'user-1',
      organizationId: 'org-1',
      active: true,
      lockedUntil: new Date(Date.now() + 60_000),
      passwordHash: await bcrypt.hash('strong-password', 4),
      roleKey: 'OWNER',
      permissions: ['*'],
      organizationActive: true,
    });

    await expect(
      service.login('owner@ticketty.sd', 'strong-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(recordFailedLogin).not.toHaveBeenCalled();
    expect(recordSuccessfulLogin).not.toHaveBeenCalled();
  });

  it('rejects an organization-less tenant user', async () => {
    findAuthUserByEmail.mockResolvedValue(null);

    await expect(
      service.login('owner@ticketty.sd', 'strong-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(signAsync).not.toHaveBeenCalled();
  });

  it('atomically clears the temporary-password requirement on change', async () => {
    const currentHash = await bcrypt.hash('Temporary-Passw0rd!', 4);
    type PasswordUpdate = {
      where: { id: string; passwordHash: string };
      data: {
        passwordHash: string;
        passwordChangedAt: Date;
        mustChangePassword: boolean;
        failedLoginAttempts: number;
        lockedUntil: null;
      };
    };
    const updateMany = jest.fn(
      (input: PasswordUpdate): Promise<{ count: number }> => {
        void input;
        return Promise.resolve({ count: 1 });
      },
    );
    const changePrisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          passwordHash: currentHash,
          active: true,
          organizationId: 'org-1',
        },
      ]),
      user: { updateMany },
    } as unknown as PrismaService;
    const changeService = new AuthService(changePrisma, jwt);

    await changeService.changePassword(
      { sub: 'user-1', orgId: 'org-1' },
      'Temporary-Passw0rd!',
      'Permanent-Passw0rd!',
    );

    expect(updateMany).toHaveBeenCalledTimes(1);
    const update = updateMany.mock.calls[0][0];
    expect(update.where).toEqual({
      id: 'user-1',
      passwordHash: currentHash,
    });
    expect(update.data.mustChangePassword).toBe(false);
    expect(update.data.failedLoginAttempts).toBe(0);
    expect(update.data.lockedUntil).toBeNull();
    expect(update.data.passwordChangedAt).toBeInstanceOf(Date);
  });
});
