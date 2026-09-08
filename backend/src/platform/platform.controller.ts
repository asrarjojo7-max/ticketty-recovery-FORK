import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PlatformService } from './platform.service';
import {
  ProvisionTenantDto,
  RenewSubscriptionDto,
  SetSubscriptionDto,
  SuspendTenantDto,
} from './dto';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PlatformScope } from '../common/decorators/platform-scope.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

/**
 * إدارة المنصة — حكرية لمشغّل المنصة (Suda-Technologies).
 *
 * هذه الـ Controller لا تتبع أي منظمة عميلة: عملياتها تدير بيانات
 * على مستوى المنصة بأكملها، لذا تمر بثلاث طبقات دفاع:
 *   1) platform.admin عبر الـ PermissionsGuard
 *   2) انتماء المستخدم لمنظمة المشغّل (PLATFORM_ORG_SLUG)
 *   3) كل الكتابات عبر SECURITY DEFINER تحت ticketty_platform
 * مستخدمو Tenants — حتى مالكوهم (OWNER بنجمتها) — لا يعبرون
 * الطبقة الأولى أصلاً (نجمة الـ Tenant لا تفتح نطاق المنصة).
 */
@Controller('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  // ── دورة حياة الـ Tenants ──────────────────────────────────

  /** تزويد Tenant جديد (منظمة + مالك + فرع رئيسي + قالب الأدوار). */
  @Post('tenants')
  @Permissions('platform.admin')
  @PlatformScope()
  async provisionTenant(
    @CurrentUser() actor: AuthUser,
    @Body() dto: ProvisionTenantDto,
  ) {
    return this.platform.provisionTenant(actor, dto);
  }

  /** قائمة المنظمات المزوّدة مع اشتراكاتها واستخدامها. */
  @Get('tenants')
  @Permissions('platform.admin')
  @PlatformScope()
  async listTenants(
    @CurrentUser() actor: AuthUser,
    @Query('search') search?: string,
  ) {
    return this.platform.listTenants(actor, search);
  }

  /** تعليق شركة — يمنع دخول مستخدميها فوراً دون مس بياناتهم. */
  @Post('tenants/:orgId/suspend')
  @Permissions('platform.admin')
  @PlatformScope()
  async suspendTenant(
    @CurrentUser() actor: AuthUser,
    @Param('orgId') orgId: string,
    @Body() dto: SuspendTenantDto,
  ) {
    return this.platform.suspendTenant(actor, orgId, dto.reason);
  }

  /** إعادة تفعيل شركة معلّقة. */
  @Post('tenants/:orgId/reactivate')
  @Permissions('platform.admin')
  @PlatformScope()
  async reactivateTenant(
    @CurrentUser() actor: AuthUser,
    @Param('orgId') orgId: string,
  ) {
    return this.platform.reactivateTenant(actor, orgId);
  }

  // ── الاشتراكات (B2B) ───────────────────────────────────────

  /** تعيين اشتراك شركة: تجربة مجانية 30 يوماً / شهري / سنوي. */
  @Post('tenants/:orgId/subscription')
  @Permissions('platform.admin')
  @PlatformScope()
  async setSubscription(
    @CurrentUser() actor: AuthUser,
    @Param('orgId') orgId: string,
    @Body() dto: SetSubscriptionDto,
  ) {
    return this.platform.setSubscription(actor, {
      ...dto,
      organizationId: orgId,
    });
  }

  /** تجديد اشتراك مدفوع (شهر واحد أو سنة). */
  @Post('tenants/:orgId/subscription/renew')
  @Permissions('platform.admin')
  @PlatformScope()
  async renewSubscription(
    @CurrentUser() actor: AuthUser,
    @Param('orgId') orgId: string,
    @Body() dto: RenewSubscriptionDto,
  ) {
    return this.platform.renewSubscription(actor, orgId, dto.months);
  }

  // ── المراقبة والتقارير ─────────────────────────────────────

  /** صحة المنصة اللحظية — بطاقة القيادة. */
  @Get('health')
  @Permissions('platform.admin')
  @PlatformScope()
  async health(@CurrentUser() actor: AuthUser) {
    return this.platform.health(actor);
  }

  /** أحداث النظام: إشعارات وتنبيهات وأخطاء (بلا بيانات حساسة). */
  @Get('events')
  @Permissions('platform.admin')
  @PlatformScope()
  async listEvents(
    @CurrentUser() actor: AuthUser,
    @Query('level') level?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : NaN;
    return this.platform.listEvents(
      actor,
      level,
      Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    );
  }

  /** إقرار حدث نظام (تعليمه كمقروء). */
  @Post('events/:eventId/acknowledge')
  @Permissions('platform.admin')
  @PlatformScope()
  async acknowledgeEvent(
    @CurrentUser() actor: AuthUser,
    @Param('eventId') eventId: string,
  ) {
    return this.platform.acknowledgeEvent(actor, eventId);
  }

  /**
   * تقرير استخدام شركة — أرقام تجارية فقط (أعداد وإيراد):
   * لا أسماء عملاء ولا هويات ولا بيانات شخصية.
   */
  @Get('tenants/:orgId/report')
  @Permissions('platform.admin')
  @PlatformScope()
  async tenantReport(
    @CurrentUser() actor: AuthUser,
    @Param('orgId') orgId: string,
    @Query('days') days?: string,
  ) {
    const parsedDays = days ? Number.parseInt(days, 10) : NaN;
    return this.platform.tenantReport(
      actor,
      orgId,
      Number.isFinite(parsedDays) ? parsedDays : undefined,
    );
  }

  /** تشغيل يدوي لنضج الاشتراكات المنتهية (للتشخيص). */
  @Post('subscriptions/expire')
  @Permissions('platform.admin')
  @PlatformScope()
  async expireSubscriptions(@CurrentUser() actor: AuthUser) {
    return this.platform.expireSubscriptions(actor);
  }

  /** دليل النسخ الاحتياطي — خطوات المشغّل الموثقة (pg_dump). */
  @Get('backup/runbook')
  @Permissions('platform.admin')
  @PlatformScope()
  async backupRunbook(@CurrentUser() actor: AuthUser) {
    await this.platform.health(actor); // نفس حارس الصلاحية
    return {
      frequency: 'يومياً قبل 03:00 صباحاً بتوقيت الخرطوم',
      tool: 'pg_dump',
      command:
        'pg_dump "$DATABASE_URL" -Fc -f /var/backups/ticketty/$(date +%Y%m%d).dump',
      retention: '30 نسخة (شهر) ثم أرشفة شهرية لسنة',
      restoreDrill:
        'استعادة تجريبية على قاعدة اختبار شهرياً — التحقق من الجداول والصفوف',
      encryption: 'تُخزن النسخ مشفرة LUKS وتُرفع لموقع خارجي مختلف',
      note: 'النسخ تحتوي بيانات عملاء — الوصول إليها مقيد بمفاتيح المشغّل وحده',
    };
  }
}
