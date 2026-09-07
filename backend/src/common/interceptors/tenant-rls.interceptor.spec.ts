import {
  CallHandler,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantRlsInterceptor } from './tenant-rls.interceptor';

function contextWithOrg(orgId?: string): ExecutionContext {
  return {
    getHandler: () => contextWithOrg,
    getClass: () => TenantRlsInterceptor,
    switchToHttp: () => ({
      getRequest: () => ({ user: orgId ? { orgId } : undefined }),
    }),
  } as unknown as ExecutionContext;
}

function reflector(isPublic: boolean): Reflector {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(isPublic),
  } as unknown as Reflector;
}

describe('TenantRlsInterceptor', () => {
  it('runs protected handlers inside the authenticated tenant context', async () => {
    const withTenantContext = jest.fn(
      (_orgId: string, callback: () => Promise<unknown>) => callback(),
    );
    const prisma = { withTenantContext } as unknown as PrismaService;
    const interceptor = new TenantRlsInterceptor(prisma, reflector(false));
    const next = { handle: () => of({ ok: true }) } as CallHandler;

    await expect(
      lastValueFrom(interceptor.intercept(contextWithOrg('org-1'), next)),
    ).resolves.toEqual({ ok: true });
    expect(withTenantContext).toHaveBeenCalledWith(
      'org-1',
      expect.any(Function),
    );
  });

  it('does not open an RLS transaction for explicitly public handlers', async () => {
    const withTenantContext = jest.fn();
    const prisma = { withTenantContext } as unknown as PrismaService;
    const interceptor = new TenantRlsInterceptor(prisma, reflector(true));
    const next = { handle: () => of({ status: 'ok' }) } as CallHandler;

    await expect(
      lastValueFrom(interceptor.intercept(contextWithOrg(), next)),
    ).resolves.toEqual({ status: 'ok' });
    expect(withTenantContext).not.toHaveBeenCalled();
  });

  it('fails closed before a protected handler runs without tenant identity', () => {
    const withTenantContext = jest.fn();
    const handle = jest.fn(() => of({ unsafe: true }));
    const prisma = { withTenantContext } as unknown as PrismaService;
    const interceptor = new TenantRlsInterceptor(prisma, reflector(false));

    expect(() =>
      interceptor.intercept(contextWithOrg(), { handle } as CallHandler),
    ).toThrow(UnauthorizedException);
    expect(handle).not.toHaveBeenCalled();
    expect(withTenantContext).not.toHaveBeenCalled();
  });
});
