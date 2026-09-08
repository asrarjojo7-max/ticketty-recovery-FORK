import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ProvisionTenantDto } from './dto';

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
  _count: { users: number; branches: number; trips: number };
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
}

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

    // معاملة واحدة ذرّية تحت دور المنصة — التصادمات يفحصها SQL
    // داخل نفس المعاملة، فلا سباق زمني بين فحص وإنشاء.
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
      const message = error instanceof Error ? error.message : '';
      // Prisma يغلف أخطاء PostgreSQL: رسالتنا تظهر داخل message، لكننا
      // نتعامل أيضاً مع unique_violation العام (23505) لضمان 409 دائماً.
      const isUniqueViolation =
        message.includes('PLATFORM_SLUG_TAKEN') ||
        message.includes('PLATFORM_EMAIL_TAKEN') ||
        ((error as { code?: string })?.code === 'P2010' &&
          message.includes('23505'));
      if (isUniqueViolation) {
        throw new ConflictException(
          message.includes('EMAIL')
            ? `البريد «${email}» مستخدم بالفعل لحساب موجود في النظام`
            : `المعرف «${slug}» أو بريد المالك مستخدم بالفعل`,
        );
      }
      throw error;
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
   * قائمة المنظمات المزوّدة — للوحة مشغّل المنصة فقط.
   * قراءة عبر وظيفة محددة الحقول: لا هَش ولا بيانات سرية.
   */
  async listTenants(
    actor: AuthUser,
    search?: string,
  ): Promise<PlatformTenantSummary[]> {
    await this.requirePlatformOperator(actor);
    const rows = await this.prisma.withPlatformRole(
      (tx) =>
        tx.$queryRaw<TenantListRow[]>`
        SELECT * FROM ticketty_security.platform_list_tenants(
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
      },
    }));
  }
}
