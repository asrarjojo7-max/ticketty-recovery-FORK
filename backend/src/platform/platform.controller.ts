import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { ProvisionTenantDto } from './dto';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PlatformScope } from '../common/decorators/platform-scope.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

/**
 * إدارة المنصة — حكرية لمشغّل المنصة (Suda-Technologies).
 *
 * هذه الـ Controller لا تتبع أي منظمة عميلة: عملياتها تُنشئ بيانات
 * على مستوى المنصة بأكملها، لذا صلاحية platform.admin (أو *) هي
 * البوابة الوحيدة. مستخدمو Tenants — حتى مالكوهم (OWNER بنجمتها) —
 * يملكون '*' داخل نطاق منظمة واحدة، لكن دالة حماية المنصة هنا
 * تتطلب الأمرَين معاً:
 *   1) platform.admin/* عبر الـ PermissionsGuard
 *   2) انتماء المستخدم لمنظمة مشغّل المنصة (PLATFORM_ORG_SLUG)
 * انظر requirePlatformOperator أدناه.
 */
@Controller('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

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

  /** قائمة المنظمات المزوّدة (لصفحة الإدارة) — لقراءة المنصة فقط. */
  @Get('tenants')
  @Permissions('platform.admin')
  @PlatformScope()
  async listTenants(
    @CurrentUser() actor: AuthUser,
    @Query('search') search?: string,
  ) {
    return this.platform.listTenants(actor, search);
  }
}
