import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SubscriptionGuard } from './subscription.guard';
import type { AuthUser } from '../decorators/current-user.decorator';

function makeContext(
  handlerMeta: Record<string, unknown>,
  classMeta: Record<string, unknown>,
  user: Partial<AuthUser> | undefined,
): ExecutionContext {
  const handler = { __meta: handlerMeta };
  const klass = { __meta: classMeta };
  const request = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => klass,
  } as unknown as ExecutionContext;
}

function makeReflector(
  handlerMeta: Record<string, unknown>,
  classMeta: Record<string, unknown>,
): Reflector {
  void handlerMeta;
  void classMeta;
  return {
    getAllAndOverride: (key: string, arr: unknown[]) => {
      const [handler, klass] = arr as Array<{
        __meta: Record<string, unknown>;
      }>;
      if (handler?.__meta?.[key] !== undefined) return handler.__meta[key];
      if (klass?.__meta?.[key] !== undefined) return klass.__meta[key];
      return undefined;
    },
  } as unknown as Reflector;
}

const baseUser: AuthUser = {
  sub: 'user-1',
  orgId: 'org-1',
  branchId: null,
  name: 'User',
  email: 'user@example.test',
  roleKey: 'OWNER',
  permissions: ['*'],
  subscriptionStatus: 'TRIALING',
  subscriptionPeriodEnd: new Date('2030-01-01T00:00:00Z'),
};

describe('SubscriptionGuard', () => {
  const policyKey = 'subscriptionPolicy';
  const scopeKey = 'platformScope';

  it.each(['TRIALING', 'ACTIVE', 'PAST_DUE'] as const)(
    'allows full-mode write in healthy state %s',
    (status) => {
      const guard = new SubscriptionGuard(makeReflector({}, {}));
      const ctx = makeContext(
        {},
        {},
        { ...baseUser, subscriptionStatus: status },
      );
      expect(guard.canActivate(ctx)).toBe(true);
    },
  );

  it.each(['EXPIRED', 'CANCELLED'] as const)(
    'blocks unannotated (fail-closed) write in state %s with 402 SUBSCRIPTION_REQUIRED',
    (status) => {
      const guard = new SubscriptionGuard(makeReflector({}, {}));
      const ctx = makeContext(
        {},
        {},
        { ...baseUser, subscriptionStatus: status },
      );
      try {
        guard.canActivate(ctx);
        throw new Error('expected HttpException');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(402);
        const body = httpError.getResponse() as Record<string, unknown>;
        expect(body.errorCode).toBe('SUBSCRIPTION_REQUIRED');
        expect(String(body.message)).toContain('اشتراك');
      }
    },
  );

  it('allows exempt-annotated route in EXPIRED state', () => {
    const guard = new SubscriptionGuard(
      makeReflector(
        { [policyKey]: { mode: 'exempt', reason: 'serve sold' } },
        {},
      ),
    );
    const ctx = makeContext(
      { [policyKey]: { mode: 'exempt', reason: 'serve sold' } },
      {},
      { ...baseUser, subscriptionStatus: 'EXPIRED' },
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('method-level full overrides class-level exempt (EXPIRED)', () => {
    const guard = new SubscriptionGuard(
      makeReflector(
        { [policyKey]: { mode: 'full' } },
        { [policyKey]: { mode: 'exempt', reason: 'admin' } },
      ),
    );
    const ctx = makeContext(
      { [policyKey]: { mode: 'full' } },
      { [policyKey]: { mode: 'exempt', reason: 'admin' } },
      { ...baseUser, subscriptionStatus: 'EXPIRED' },
    );
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
  });

  it('method-level exempt overrides class-level full (bookings.cancel pattern)', () => {
    const guard = new SubscriptionGuard(
      makeReflector(
        { [policyKey]: { mode: 'exempt', reason: 'cancel sold' } },
        { [policyKey]: { mode: 'full' } },
      ),
    );
    const ctx = makeContext(
      { [policyKey]: { mode: 'exempt', reason: 'cancel sold' } },
      { [policyKey]: { mode: 'full' } },
      { ...baseUser, subscriptionStatus: 'CANCELLED' },
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows when subscriptionStatus is null (pre-provisioning window)', () => {
    const guard = new SubscriptionGuard(makeReflector({}, {}));
    const ctx = makeContext({}, {}, { ...baseUser, subscriptionStatus: null });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('skips platform-scope routes (operator manages subscriptions)', () => {
    const guard = new SubscriptionGuard(
      makeReflector({ [scopeKey]: true }, {}),
    );
    const ctx = makeContext(
      { [scopeKey]: true },
      {},
      { ...baseUser, subscriptionStatus: 'EXPIRED' },
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('skips unauthenticated requests (@Public — JwtAuthGuard owns 401)', () => {
    const guard = new SubscriptionGuard(makeReflector({}, {}));
    const ctx = makeContext({}, {}, undefined);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('explicit full policy blocks EXPIRED identically to the fail-closed default', () => {
    const guard = new SubscriptionGuard(
      makeReflector({ [policyKey]: { mode: 'full' } }, {}),
    );
    const ctx = makeContext(
      { [policyKey]: { mode: 'full' } },
      {},
      { ...baseUser, subscriptionStatus: 'EXPIRED' },
    );
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
  });
});
