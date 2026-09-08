import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ProvisionTenantDto, SetSubscriptionDto } from './dto';

/** نتيجة التزويد — تُعاد للعميل دون أي بيانات سرية. */
export interface ProvisionedTenant {
  organization: {
    id: string;
    name: string;
    slug: string;
    active: boolean;
    createdAt: Date;
  };
  owner: {
    id: string;
    name: string;
    email: string;
    roleKey: string;
    active: boolean;
    /** يظهر مرة واحدة فقط في الاستجابة — لا يُخزن نصاً أبداً. */
    mustChangePassword: true;
  };
  primaryBranch: {
    id: string;
    name: string;
    city: string;
  };
}

export interface PlatformTenantSummary {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  createdAt: Date;
  _count: { users: number; branches: number; trips: number; tickets: number };
  subscription: {
    planKey: string;
    status: string;
    currentPeriodEnd: Date;
    priceSdg: number;
  } | null;
}

export interface PlatformSubscription {
  subscriptionId: string;
  organizationId: string;
  planKey: string;
  priceSdg: number;
  status: string;
  startedAt: Date;
  currentPeriodEnd: Date;
}

export interface PlatformHealth {
  tenantsTotal: number;
  tenantsActive: number;
  tenantsSuspended: number;
  trialsRunning: number;
  trialsExpiringSoon: number;
  subscriptionsActive: number;
  subscriptionsExpired: number;
  pendingAccountingEvents: number;
  unacknowledgedEvents: number;
  databaseSize: string;
}

export interface PlatformSystemEvent {
  id: string;
  level: string;
  category: string;
  message: string;
  context: Record<string, unknown> | null;
  acknowledgedAt: Date | null;
  createdAt: Date;
}

export interface PlatformTenantReport {
  organizationId: string;
  organizationName: string;
  tripsTotal: number;
  tripsRecent: number;
  ticketsTotal: number;
  ticketsRecent: number;
  revenueTotalSdg: number;
  revenueRecentSdg: number;
  activeUsers: number;
  branches: number;
  buses: number;
  lastActivity: Date | null;
}

/**
 * حدود ثقة بوابة المنصة:
 * - الصلاحية platform.admin/* عبر PermissionsGuard (الطبقة 1)
 * - الانتماء لمنظمة المشغّل عبر platform_operator_org (الطبقة 2)
 * - كل عمليات الكتابة عبر SECURITY DEFINER محددة النطاق تحت دور
 *   ticketty_platform — لا وصول كتابة عام خارجها (الطبقة 3)
 */
const PLATFORM_ORG_SLUG = process.env.PLATFORM_ORG_SLUG ?? 'ticketty';

interface ProvisionRow {
  organization_id: string;
  organization_slug: string;
  organization_name: string;
  branch_id: string;
  branch_name: string;
  branch_city: string;
  role_id: string;
  role_key: string;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  audit_id: string;
  /** PILOT BLOCKER-1: فترة الافتتاح + جاهزية المحاسبة (ذريّة مع التزويد) */
  fiscal_period_id: string;
  accounting_ready: boolean;
}

interface OperatorOrgRow {
  org_id: string;
  org_active: boolean;
}

interface TenantListRow {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  created_at: Date;
  users_count: bigint;
  branches_count: bigint;
  trips_count: bigint;
  tickets_count: bigint;
  plan_key: string | null;
  subscription_status: string | null;
  subscription_end: Date | null;
  price_sdg: number | null;
}

interface SubscriptionRow {
  subscription_id: string;
  organization_id: string;
  plan_key: string;
  price_sdg: number;
  status: string;
  started_at: Date;
  current_period_end: Date;
}

interface LifecycleRow {
  organization_id: string;
  active: boolean;
  suspended_at?: Date;
  reactivated_at?: Date;
}

interface HealthRow {
  tenants_total: bigint;
  tenants_active: bigint;
  tenants_suspended: bigint;
  trials_running: bigint;
  trials_expiring_soon: bigint;
  subscriptions_active: bigint;
  subscriptions_expired: bigint;
  pending_accounting_events: bigint;
  unacknowledged_events: bigint;
  database_size: string;
  app_version: string;
}

interface EventRow {
  id: string;
  level: string;
  category: string;
  message: string;
  context: Record<string, unknown> | null;
  acknowledged_at: Date | null;
  created_at: Date;
}

interface TenantReportRow {
  organization_id: string;
  organization_name: string;
  trips_total: bigint;
  trips_recent: bigint;
  tickets_total: bigint;
  tickets_recent: bigint;
  revenue_total_sdg: { toNumber(): number };
  revenue_recent_sdg: { toNumber(): number };
  active_users: bigint;
  branches: bigint;
  buses: bigint;
  last_activity: Date | null;
}

/** خطة الاشتراك المعتمدة — مصدر حقيقة واحد للسعر على الخادم. */
const PLAN_PRICES_SDG: Readonly<Record<string, number>> = {
  TRIAL: 0,
  MONTHLY: 199_000,
  YEARLY: 2_388_000,
} as const;

@Injectable()
export class PlatformService {
  private readonly logger = new Logger(PlatformService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * الحارس الثاني (دفاع في العمق): صلاحية + انتماء لمنظمة المنصة.
   * يُستدعى داخل كل عملية — لا يعتمد على الـ guard وحده.
   */
  private async requirePlatformOperator(user: AuthUser): Promise<void> {
    const perms = user.permissions ?? [];
    if (!perms.includes('*') && !perms.includes('platform.admin')) {
      throw new ForbiddenException(
        'هذه العملية متاحة فقط لمشغّل المنصة (Suda-Technologies)',
      );
    }

    const rows = await this.prisma.withPlatformRole(
      (tx) =>
        tx.$queryRaw<OperatorOrgRow[]>`
        SELECT org_id, org_active
        FROM ticketty_security.platform_operator_org(${PLATFORM_ORG_SLUG})
      `,
    );
    const operatorOrg = rows[0];
    if (!operatorOrg?.org_active || operatorOrg.org_id !== user.orgId) {
      throw new ForbiddenException(
        'هذه العملية متاحة فقط لمشغّل المنصة (Suda-Technologies)',
      );
    }
  }

  /** ترجمة أخطاء PostgreSQL إلى استثناءات HTTP عربية واضحة. */
  private translateSqlError(error: unknown, fallback: string): never {
    const message = error instanceof Error ? error.message : '';
    const isUniqueViolation =
      message.includes('PLATFORM_SLUG_TAKEN') ||
      message.includes('PLATFORM_EMAIL_TAKEN') ||
      ((error as { code?: string })?.code === 'P2010' &&
        message.includes('23505'));
    if (isUniqueViolation) {
      throw new ConflictException(fallback);
    }
    if (
      message.includes('PLATFORM_TENANT_NOT_FOUND') ||
      message.includes('PLATFORM_EVENT_NOT_FOUND') ||
      message.includes('PLATFORM_NO_ACTIVE_SUBSCRIPTION')
    ) {
      throw new BadRequestException(fallback);
    }
    throw error;
  }

  async provisionTenant(
    actor: AuthUser,
    dto: ProvisionTenantDto,
  ): Promise<ProvisionedTenant> {
    await this.requirePlatformOperator(actor);

    const email = dto.ownerEmail.trim().toLowerCase();
    const slug = dto.slug.trim().toLowerCase();

    // كلمة المرور تُهَش خارج أي استدعاء SQL — لا تظهر نصاً في
    // أي سجل بيانات أو log، والهَش فقط يمرر للوظيفة.
    const passwordHash = await bcrypt.hash(dto.initialPassword, 12);

    let rows: ProvisionRow[] = [];
    try {
      rows = await this.prisma.withPlatformRole(
        (tx) =>
          tx.$queryRaw<ProvisionRow[]>`
          SELECT * FROM ticketty_security.platform_provision_tenant(
            ${dto.name.trim()},
            ${slug},
            ${dto.organizationPhone ?? null},
            ${dto.primaryBranchName?.trim() || 'الفرع الرئيسي'},
            ${dto.primaryBranchCity?.trim() || 'الخرطوم'},
            ${dto.ownerName.trim()},
            ${email},
            ${passwordHash},
            ${actor.sub},
            ${actor.orgId}
          )
        `,
      );
    } catch (error) {
      this.translateSqlError(
        error,
        `المعرف «${slug}» أو بريد المالك مستخدم بالفعل`,
      );
    }

    const row = rows[0];
    if (!row) {
      throw new Error('Provisioning returned no result');
    }

    this.logger.log(
      `Tenant provisioned: slug=${slug} owner=${email} by=${actor.email}`,
    );

    return {
      organization: {
        id: row.organization_id,
        name: row.organization_name,
        slug: row.organization_slug,
        active: true,
        createdAt: new Date(),
      },
      owner: {
        id: row.owner_id,
        name: row.owner_name,
        email: row.owner_email,
        roleKey: row.role_key,
        active: true,
        mustChangePassword: true,
      },
      primaryBranch: {
        id: row.branch_id,
        name: row.branch_name,
        city: row.branch_city,
      },
    };
  }

  /**
   * قائمة المنظمات المزوّدة مع اشتراكاتها — للوحة مشغّل المنصة فقط.
   */
  async listTenants(
    actor: AuthUser,
    search?: string,
  ): Promise<PlatformTenantSummary[]> {
    await this.requirePlatformOperator(actor);
    const rows = await this.prisma.withPlatformRole(
      (tx) =>
        tx.$queryRaw<TenantListRow[]>`
        SELECT * FROM ticketty_security.platform_list_tenants_v2(
          ${search?.trim() || null}
        )
      `,
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      active: row.active,
      createdAt: row.created_at,
      _count: {
        users: Number(row.users_count),
        branches: Number(row.branches_count),
        trips: Number(row.trips_count),
        tickets: Number(row.tickets_count),
      },
      subscription: row.plan_key
        ? {
            planKey: row.plan_key,
            status: row.subscription_status ?? '',
            currentPeriodEnd: row.subscription_end ?? new Date(0),
            priceSdg: row.price_sdg ?? 0,
          }
        : null,
    }));
  }

  /** تعليق Tenant — يمنع دخول مستخدميه فوراً (بياناته لا تُمس). */
  async suspendTenant(
    actor: AuthUser,
    orgId: string,
    reason: string,
  ): Promise<{ organizationId: string; active: boolean }> {
    await this.requirePlatformOperator(actor);
    let rows: LifecycleRow[] = [];
    try {
      rows = await this.prisma.withPlatformRole(
        (tx) =>
          tx.$queryRaw<LifecycleRow[]>`
          SELECT * FROM ticketty_security.platform_suspend_tenant(
            ${orgId}, ${reason.trim()}, ${actor.sub}, ${actor.orgId}
          )
        `,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('PLATFORM_OPERATOR_PROTECTED')) {
        throw new BadRequestException('لا يمكن تعليق منظمة مشغّل المنصة نفسها');
      }
      this.translateSqlError(error, 'الشركة غير موجودة أو معلّقة أصلاً');
    }
    const row = rows[0];
    if (!row) throw new Error('Suspend returned no result');
    this.logger.warn(`Tenant suspended: ${orgId} by=${actor.email}`);
    return { organizationId: row.organization_id, active: row.active };
  }

  /** إعادة تفعيل Tenant معلّق. */
  async reactivateTenant(
    actor: AuthUser,
    orgId: string,
  ): Promise<{ organizationId: string; active: boolean }> {
    await this.requirePlatformOperator(actor);
    let rows: LifecycleRow[] = [];
    try {
      rows = await this.prisma.withPlatformRole(
        (tx) =>
          tx.$queryRaw<LifecycleRow[]>`
          SELECT * FROM ticketty_security.platform_reactivate_tenant(
            ${orgId}, ${actor.sub}, ${actor.orgId}
          )
        `,
      );
    } catch (error) {
      this.translateSqlError(error, 'الشركة غير موجودة أو نشطة أصلاً');
    }
    const row = rows[0];
    if (!row) throw new Error('Reactivate returned no result');
    this.logger.log(`Tenant reactivated: ${orgId} by=${actor.email}`);
    return { organizationId: row.organization_id, active: row.active };
  }

  /** تعيين اشتراك شركة (تجربة مجانية/شهري/سنوي). */
  async setSubscription(
    actor: AuthUser,
    dto: SetSubscriptionDto,
  ): Promise<PlatformSubscription> {
    await this.requirePlatformOperator(actor);
    const price = PLAN_PRICES_SDG[dto.planKey] ?? -1;
    if (price < 0) {
      throw new BadRequestException('خطة غير معروفة');
    }
    // السعر في الـ DTO اختياري "تحقق فقط" — المصدر هو الخادم دائماً
    if (dto.priceSdg !== undefined && dto.priceSdg !== price) {
      throw new BadRequestException(
        'السعر لا يطابق الخطة المعتمدة — الأسعار ثابتة على الخادم',
      );
    }

    let rows: SubscriptionRow[] = [];
    try {
      rows = await this.prisma.withPlatformRole(
        (tx) =>
          tx.$queryRaw<SubscriptionRow[]>`
          SELECT * FROM ticketty_security.platform_set_subscription(
            ${dto.organizationId},
            ${dto.planKey},
            ${price}::int,
            0,
            ${dto.notes ?? null},
            ${actor.sub},
            ${actor.orgId}
          )
        `,
      );
    } catch (error) {
      this.translateSqlError(error, 'تعذر تعيين الاشتراك — تحقق من الشركة');
    }
    const row = rows[0];
    if (!row) throw new Error('SetSubscription returned no result');
    this.logger.log(
      `Subscription set: org=${dto.organizationId} plan=${dto.planKey} by=${actor.email}`,
    );
    return {
      subscriptionId: row.subscription_id,
      organizationId: row.organization_id,
      planKey: row.plan_key,
      priceSdg: row.price_sdg,
      status: row.status,
      startedAt: row.started_at,
      currentPeriodEnd: row.current_period_end,
    };
  }

  /** تجديد اشتراك مدفوع — يمتد من نهاية الفترة الحالية. */
  async renewSubscription(
    actor: AuthUser,
    orgId: string,
    months: number,
  ): Promise<PlatformSubscription> {
    await this.requirePlatformOperator(actor);
    if (months !== 1 && months !== 12) {
      throw new BadRequestException('التجديد إما شهر واحد أو اثنا عشر شهراً');
    }

    let rows: SubscriptionRow[] = [];
    try {
      rows = await this.prisma.withPlatformRole(
        (tx) =>
          tx.$queryRaw<SubscriptionRow[]>`
          SELECT * FROM ticketty_security.platform_renew_subscription(
            ${orgId}, ${months}::int, ${actor.sub}, ${actor.orgId}
          )
        `,
      );
    } catch (error) {
      this.translateSqlError(
        error,
        'لا يوجد اشتراك نشط لهذه الشركة — عيّن اشتراكاً أولاً',
      );
    }
    const row = rows[0];
    if (!row) throw new Error('Renew returned no result');
    this.logger.log(`Subscription renewed: org=${orgId} months=${months}`);
    return {
      subscriptionId: row.subscription_id,
      organizationId: orgId,
      planKey: row.plan_key,
      priceSdg: row.price_sdg,
      status: row.status,
      startedAt: new Date(),
      currentPeriodEnd: row.current_period_end,
    };
  }

  /** صحة المنصة — بطاقة القيادة اللحظية للمشغّل. */
  async health(actor: AuthUser): Promise<PlatformHealth> {
    await this.requirePlatformOperator(actor);
    const rows = await this.prisma.withPlatformRole(
      (tx) =>
        tx.$queryRaw<HealthRow[]>`
        SELECT * FROM ticketty_security.platform_health()
      `,
    );
    const row = rows[0];
    if (!row) throw new Error('Health returned no result');
    return {
      tenantsTotal: Number(row.tenants_total),
      tenantsActive: Number(row.tenants_active),
      tenantsSuspended: Number(row.tenants_suspended),
      trialsRunning: Number(row.trials_running),
      trialsExpiringSoon: Number(row.trials_expiring_soon),
      subscriptionsActive: Number(row.subscriptions_active),
      subscriptionsExpired: Number(row.subscriptions_expired),
      pendingAccountingEvents: Number(row.pending_accounting_events),
      unacknowledgedEvents: Number(row.unacknowledged_events),
      databaseSize: row.database_size,
    };
  }

  /** أحداث النظام — إشعارات وتنبيهات المشغّل. */
  async listEvents(
    actor: AuthUser,
    level?: string,
    limit?: number,
  ): Promise<PlatformSystemEvent[]> {
    await this.requirePlatformOperator(actor);
    const normalizedLevel =
      level && ['INFO', 'WARN', 'ERROR'].includes(level.toUpperCase())
        ? level.toUpperCase()
        : null;
    const rows = await this.prisma.withPlatformRole(
      (tx) =>
        tx.$queryRaw<EventRow[]>`
        SELECT * FROM ticketty_security.platform_list_events(
          ${normalizedLevel}, ${limit ?? 50}::int
        )
      `,
    );
    return rows.map((row) => ({
      id: row.id,
      level: row.level,
      category: row.category,
      message: row.message,
      context: row.context,
      acknowledgedAt: row.acknowledged_at,
      createdAt: row.created_at,
    }));
  }

  /** إقرار حدث نظام (قرأه المشغّل). */
  async acknowledgeEvent(
    actor: AuthUser,
    eventId: string,
  ): Promise<{ id: string; acknowledgedAt: Date }> {
    await this.requirePlatformOperator(actor);
    let rows: { id: string; acknowledged_at: Date }[] = [];
    try {
      rows = await this.prisma.withPlatformRole(
        (tx) =>
          tx.$queryRaw<{ id: string; acknowledged_at: Date }[]>`
          SELECT * FROM ticketty_security.platform_ack_event(
            ${eventId}, ${actor.sub}
          )
        `,
      );
    } catch (error) {
      this.translateSqlError(error, 'الحدث غير موجود أو مُقرّ به أصلاً');
    }
    const row = rows[0];
    if (!row) {
      throw new BadRequestException('الحدث غير موجود أو مُقرّ به أصلاً');
    }
    return { id: row.id, acknowledgedAt: row.acknowledged_at };
  }

  /**
   * تقرير استخدام شركة — أرقام تجارية مجمّعة فقط:
   * أعداد رحلات/تذاكر/إيراد إجمالي — لا أسماء عملاء ولا هويات.
   * يخدم متابعة الأداء وتطوير المنتج دون أي مسؤولية بيانات شخصية.
   */
  async tenantReport(
    actor: AuthUser,
    orgId: string,
    days?: number,
  ): Promise<PlatformTenantReport> {
    await this.requirePlatformOperator(actor);
    const window =
      days && Number.isInteger(days) && days > 0 && days <= 365 ? days : 30;
    const rows = await this.prisma.withPlatformRole(
      (tx) =>
        tx.$queryRaw<TenantReportRow[]>`
        SELECT * FROM ticketty_security.platform_tenant_report(
          ${orgId}, ${window}::int
        )
      `,
    );
    const row = rows[0];
    if (!row) {
      throw new BadRequestException('الشركة غير موجودة');
    }
    return {
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      tripsTotal: Number(row.trips_total),
      tripsRecent: Number(row.trips_recent),
      ticketsTotal: Number(row.tickets_total),
      ticketsRecent: Number(row.tickets_recent),
      revenueTotalSdg: Number(row.revenue_total_sdg),
      revenueRecentSdg: Number(row.revenue_recent_sdg),
      activeUsers: Number(row.active_users),
      branches: Number(row.branches),
      buses: Number(row.buses),
      lastActivity: row.last_activity,
    };
  }

  /**
   * نضج الاشتراكات المنتهية — يستدعيه الـ worker دورياً.
   * قرار التعليق النهائي يبقى بيد المشغّل (لا أتمتة قاسية).
   */
  async expireSubscriptions(actor: AuthUser) {
    await this.requirePlatformOperator(actor);
    const rows = await this.prisma.withPlatformRole(
      (tx) =>
        tx.$queryRaw<{ expired: number }[]>`
        SELECT ticketty_security.platform_expire_subscriptions()::int AS expired
      `,
    );
    return { expired: Number(rows[0]?.expired ?? 0) };
  }
}
