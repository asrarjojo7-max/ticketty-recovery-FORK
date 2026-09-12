import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator';
import { PasswordChangeRequiredGuard } from './password-change-required.guard';

function contextFor(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('PasswordChangeRequiredGuard', () => {
  it('blocks normal endpoints with a stable machine-readable error', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const guard = new PasswordChangeRequiredGuard(reflector);

    try {
      guard.canActivate(
        contextFor({ user: { mustChangePassword: true } as never }),
      );
      throw new Error('Expected guard to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toEqual({
        statusCode: 403,
        message: 'يجب تغيير كلمة المرور المؤقتة قبل المتابعة',
        errorCode: 'PASSWORD_CHANGE_REQUIRED',
      });
    }
  });

  it('allows the narrow remediation endpoints', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    } as unknown as Reflector;
    const guard = new PasswordChangeRequiredGuard(reflector);

    expect(
      guard.canActivate(
        contextFor({ user: { mustChangePassword: true } as never }),
      ),
    ).toBe(true);
  });

  it('allows authenticated users with a permanent password', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const guard = new PasswordChangeRequiredGuard(reflector);

    expect(
      guard.canActivate(
        contextFor({ user: { mustChangePassword: false } as never }),
      ),
    ).toBe(true);
  });
});
