import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { TenantDatabaseContext } from './tenant-database-context';

const RUNTIME_DATABASE_ROLE = 'ticketty_app';
const AUTH_DATABASE_ROLE = 'ticketty_auth';
const PLATFORM_DATABASE_ROLE = 'ticketty_platform';
const ACCOUNTING_WORKER_ROLE = 'ticketty_accounting_worker';
const TENANT_DELEGATES = new Set([
  'organization',
  'organizationTicketBranding',
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
  passwordChangedAt: Date;
  mustChangePassword: boolean;
}

export type AuthRequestRecord = Omit<
  AuthLoginRecord,
  'passwordHash' | 'failedLoginAttempts' | 'lockedUntil'
> & {
  /**
   * من auth_user_by_id v3 (هجرة 20260909000000): حالة آخر صف
   * اشتراك للمنظمة بأي حالة، أو null عندما لا يوجد صف إطلاقاً.
   * مصدر سلطة SubscriptionGuard — لا يوجد أي مصدر ثانٍ.
   */
  subscriptionStatus: string | null;
  subscriptionPeriodEnd: Date | null;
};

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
    if (process.env.NODE_ENV === 'production') {
      await this.assertLeastPrivilegeRuntimeIdentity();
    }
  }

  private async assertLeastPrivilegeRuntimeIdentity(): Promise<void> {
    const [identity] = await super.$queryRaw<
      Array<{
        name: string;
        superuser: boolean;
        bypassRls: boolean;
        createRole: boolean;
        createDb: boolean;
        inherit: boolean;
        ownedObjects: bigint;
        directTableGrants: bigint;
      }>
    >`
      SELECT
        session_user AS name,
        r.rolsuper AS superuser,
        r.rolbypassrls AS "bypassRls",
        r.rolcreaterole AS "createRole",
        r.rolcreatedb AS "createDb",
        r.rolinherit AS inherit,
        (
          SELECT count(*)
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname IN ('public', 'ticketty_security')
            AND pg_get_userbyid(c.relowner) = session_user
        ) AS "ownedObjects",
        (
          SELECT count(*)
          FROM information_schema.table_privileges p
          WHERE p.grantee = session_user
        ) AS "directTableGrants"
      FROM pg_roles r
      WHERE r.rolname = session_user
    `;
    if (
      !identity ||
      identity.name !== 'ticketty_runtime' ||
      identity.superuser ||
      identity.bypassRls ||
      identity.createRole ||
      identity.createDb ||
      identity.inherit ||
      Number(identity.ownedObjects) !== 0 ||
      Number(identity.directTableGrants) !== 0
    ) {
      throw new Error(
        'Production DATABASE_URL must use the least-privilege ticketty_runtime role',
      );
    }
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

  async accountingQueueDepth(): Promise<
    Array<{ status: string; count: number }>
  > {
    if (this.tenantContext.current()) {
      throw new Error('Global accounting metrics cannot run in tenant context');
    }
    return super.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        `SET LOCAL ROLE ${ACCOUNTING_WORKER_ROLE}`,
      );
      const rows = await transaction.$queryRaw<
        Array<{ status: string; count: bigint }>
      >`
        SELECT status, event_count AS count
        FROM ticketty_security.accounting_queue_depth()
      `;
      return rows.map((row) => ({
        status: row.status,
        count: Number(row.count),
      }));
    });
  }

  /**
   * سحب نضج الاشتراكات لـ SubscriptionSweepWorker — تحت دور
   * ticketty_app نفسه: يثبت عملياً أن المنح الممنوحة هي فقط
   * EXECUTE على دالة بلا معاملات (لا يمكن توجيهها)، والدالة
   * SECURITY DEFINER فتتجاوز RLS بأمان داخل نطاقها.
   * idempotent بالقاعدة الصرفة (currentPeriodEnd < now()).
   */
  async runSubscriptionSweep(): Promise<number> {
    if (this.tenantContext.current()) {
      throw new Error('Subscription sweep cannot run in tenant context');
    }
    const rows = await super.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        `SET LOCAL ROLE ${RUNTIME_DATABASE_ROLE}`,
      );
      return transaction.$queryRaw<Array<{ expired: number }>>`
        SELECT ticketty_security.expire_subscriptions_sweep()::int AS expired
      `;
    });
    return Number(rows[0]?.expired ?? 0);
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
          organization_active AS "organizationActive",
          password_changed_at AS "passwordChangedAt",
          must_change_password AS "mustChangePassword"
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
          organization_active AS "organizationActive",
          password_changed_at AS "passwordChangedAt",
          must_change_password AS "mustChangePassword",
          subscription_status AS "subscriptionStatus",
          subscription_period_end AS "subscriptionPeriodEnd"
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
    // auth_record_success returns void; $queryRaw cannot deserialize a void
    // column (P2010). Use $executeRaw instead.
    await this.withAuthRole(
      (transaction) => transaction.$executeRaw`
        SELECT ticketty_security.auth_record_success(${userId})
      `,
    );
  }

  async withAuthRole<T>(
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

  /**
   * بوابة المنصة — عمليات Provisioning الـ Tenants.
   * خارج سياق RLS لأي منظمة قائمة (بالتصميم): إنشاء منظمة جديدة
   * مستحيل داخل سياق tenant لأن RLS على organizations يقيّد
   * id = current_organization_id(). لذا نستخدم SECURITY DEFINER
   * functions محددة النطاق تحت دور ticketty_platform — نفس نمط
   * الحدود الموثوقة في auth boundary، بلا أي وصول كتابة عام.
   */
  async withPlatformRole<T>(
    callback: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (this.tenantContext.current()) {
      throw new Error('Platform database access cannot run in tenant context');
    }
    return super.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        `SET LOCAL ROLE ${PLATFORM_DATABASE_ROLE}`,
      );
      return callback(transaction);
    });
  }
}
