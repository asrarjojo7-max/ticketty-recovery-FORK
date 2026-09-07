import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { TenantDatabaseContext } from './tenant-database-context';

const RUNTIME_DATABASE_ROLE = 'ticketty_app';
const AUTH_DATABASE_ROLE = 'ticketty_auth';
const ACCOUNTING_WORKER_ROLE = 'ticketty_accounting_worker';
const TENANT_DELEGATES = new Set([
  'organization',
  'branch',
  'role',
  'user',
  'customer',
  'route',
  'routeStop',
  'bus',
  'driver',
  'seatTemplate',
  'seat',
  'trip',
  'tripSeat',
  'booking',
  'ticket',
  'payment',
  'refund',
  'idempotencyRecord',
  'manifest',
  'agent',
  'commission',
  'expense',
  'expenseAdjustment',
  'settlement',
  'settlementLine',
  'account',
  'accountingPolicy',
  'accountingEvent',
  'fiscalPeriod',
  'journal',
  'journalEntry',
  'journalEntryLine',
  'auditLog',
]);
const RAW_OPERATIONS = new Set([
  '$queryRaw',
  '$queryRawUnsafe',
  '$executeRaw',
  '$executeRawUnsafe',
  '$transaction',
]);

type TransactionCallback<T> = (client: Prisma.TransactionClient) => Promise<T>;

export interface AuthLoginRecord {
  id: string;
  organizationId: string;
  branchId: string | null;
  name: string;
  email: string;
  passwordHash: string;
  active: boolean;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  roleKey: string;
  permissions: string[];
  organizationActive: boolean;
}

export type AuthRequestRecord = Omit<
  AuthLoginRecord,
  'passwordHash' | 'failedLoginAttempts' | 'lockedUntil'
>;

function bindClientValue(receiver: object, value: unknown): unknown {
  if (typeof value !== 'function') return value;
  return (...args: unknown[]): unknown =>
    Reflect.apply(value, receiver, args) as unknown;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(
    private readonly tenantContext: TenantDatabaseContext = new TenantDatabaseContext(),
  ) {
    super();

    return new Proxy(this, {
      get: (target, property, receiver) => {
        const store = tenantContext.current();
        if (store) {
          if (property === '$transaction') {
            return <T>(
              input: TransactionCallback<T>,
              options?: unknown,
            ): Promise<T> => {
              if (typeof input !== 'function') {
                throw new Error(
                  'Array transactions are not supported inside an RLS request transaction',
                );
              }
              if (options !== undefined) {
                throw new Error(
                  'Nested transaction options are not supported inside an RLS request transaction',
                );
              }
              return input(store.client);
            };
          }

          const transactionValue: unknown = Reflect.get(store.client, property);
          if (transactionValue !== undefined) {
            return bindClientValue(store.client, transactionValue);
          }
          if (
            TENANT_DELEGATES.has(String(property)) ||
            RAW_OPERATIONS.has(String(property))
          ) {
            throw new Error(
              `Database operation ${String(property)} is unavailable`,
            );
          }
        } else if (
          TENANT_DELEGATES.has(String(property)) ||
          RAW_OPERATIONS.has(String(property))
        ) {
          throw new Error(
            `Tenant database operation ${String(property)} requires an explicit context`,
          );
        }

        const value: unknown = Reflect.get(target, property, receiver);
        return bindClientValue(target, value);
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async ping(): Promise<void> {
    await super.$queryRaw`SELECT 1::integer AS ready`;
  }

  async withTenantContext<T>(
    organizationId: string,
    callback: () => Promise<T>,
  ): Promise<T> {
    const existing = this.tenantContext.current();
    if (existing) {
      if (existing.organizationId !== organizationId) {
        throw new Error('Cross-tenant nested database context is forbidden');
      }
      return callback();
    }

    return super.$transaction(
      async (transaction) => {
        await transaction.$executeRawUnsafe(
          `SET LOCAL ROLE ${RUNTIME_DATABASE_ROLE}`,
        );
        await transaction.$queryRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
        const [context] = await transaction.$queryRaw<
          Array<{ role: string; organizationId: string | null }>
        >`SELECT current_user AS role, current_setting('app.organization_id', true) AS "organizationId"`;
        if (
          context?.role !== RUNTIME_DATABASE_ROLE ||
          context.organizationId !== organizationId
        ) {
          throw new Error('Failed to establish tenant database context');
        }
        return this.tenantContext.run(
          { client: transaction, organizationId },
          callback,
        );
      },
      { maxWait: 5_000, timeout: 30_000 },
    );
  }

  async claimAccountingEvent(
    workerId: string,
  ): Promise<{ id: string; organizationId: string } | null> {
    if (this.tenantContext.current()) {
      throw new Error('Global accounting claims cannot run in tenant context');
    }
    const rows = await super.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        `SET LOCAL ROLE ${ACCOUNTING_WORKER_ROLE}`,
      );
      return transaction.$queryRaw<
        Array<{ eventId: string; organizationId: string }>
      >`
        SELECT
          event_id AS "eventId",
          organization_id AS "organizationId"
        FROM ticketty_security.claim_accounting_event(${workerId})
      `;
    });
    const claimed = rows[0];
    return claimed
      ? { id: claimed.eventId, organizationId: claimed.organizationId }
      : null;
  }

  async findAuthUserByEmail(email: string): Promise<AuthLoginRecord | null> {
    const rows = await this.withAuthRole(
      (transaction) => transaction.$queryRaw<AuthLoginRecord[]>`
        SELECT
          user_id AS id,
          organization_id AS "organizationId",
          branch_id AS "branchId",
          user_name AS name,
          user_email AS email,
          password_hash AS "passwordHash",
          user_active AS active,
          failed_login_attempts AS "failedLoginAttempts",
          locked_until AS "lockedUntil",
          role_key AS "roleKey",
          role_permissions AS permissions,
          organization_active AS "organizationActive"
        FROM ticketty_security.auth_user_by_email(${email})
      `,
    );
    return rows[0] ?? null;
  }

  async findAuthUserById(userId: string): Promise<AuthRequestRecord | null> {
    const rows = await this.withAuthRole(
      (transaction) => transaction.$queryRaw<AuthRequestRecord[]>`
        SELECT
          user_id AS id,
          organization_id AS "organizationId",
          branch_id AS "branchId",
          user_name AS name,
          user_email AS email,
          user_active AS active,
          role_key AS "roleKey",
          role_permissions AS permissions,
          organization_active AS "organizationActive"
        FROM ticketty_security.auth_user_by_id(${userId})
      `,
    );
    return rows[0] ?? null;
  }

  async recordFailedLogin(userId: string): Promise<number> {
    const rows = await this.withAuthRole(
      (transaction) => transaction.$queryRaw<Array<{ attempts: number }>>`
        SELECT ticketty_security.auth_record_failed_login(${userId}) AS attempts
      `,
    );
    return rows[0]?.attempts ?? 0;
  }

  async recordSuccessfulLogin(userId: string): Promise<void> {
    await this.withAuthRole(
      (transaction) => transaction.$queryRaw`
        SELECT ticketty_security.auth_record_success(${userId})
      `,
    );
  }

  private async withAuthRole<T>(
    callback: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (this.tenantContext.current()) {
      throw new Error(
        'Authentication database access cannot run in tenant context',
      );
    }
    return super.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        `SET LOCAL ROLE ${AUTH_DATABASE_ROLE}`,
      );
      return callback(transaction);
    });
  }
}
