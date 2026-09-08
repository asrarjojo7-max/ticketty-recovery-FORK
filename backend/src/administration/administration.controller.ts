import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { SubscriptionPolicy } from '../common/decorators/subscription-policy.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { AdministrationService } from './administration.service';
import {
  CreateBranchDto,
  CreateRoleDto,
  CreateUserDto,
  UpdateOrganizationDto,
  UpdateUserDto,
} from './dto';
@SubscriptionPolicy({
  mode: 'exempt',
  reason:
    'إدارة تشغيلية كاملة (مستخدمون/أدوار/إعدادات/فروع) — تبقى متاحة لتسوية وضع الشركة (عقد §1)',
})
@Controller('administration')
export class AdministrationController {
  constructor(private readonly service: AdministrationService) {}
  @Get('organization') @Permissions('settings.read') organization(
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.organization(u);
  }
  @Patch('organization') @Permissions('settings.write') updateOrganization(
    @CurrentUser() u: AuthUser,
    @Body() d: UpdateOrganizationDto,
  ) {
    return this.service.updateOrganization(u, d);
  }
  @Get('branches') @Permissions('settings.read') branches(
    @CurrentUser() u: AuthUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.service.branches(u, query);
  }
  @Post('branches') @Permissions('settings.write') createBranch(
    @CurrentUser() u: AuthUser,
    @Body() d: CreateBranchDto,
  ) {
    return this.service.createBranch(u, d);
  }
  @Get('roles') @Permissions('settings.read') roles(
    @CurrentUser() u: AuthUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.service.roles(u, query);
  }
  @Post('roles') @Permissions('settings.write') createRole(
    @CurrentUser() u: AuthUser,
    @Body() d: CreateRoleDto,
  ) {
    return this.service.createRole(u, d);
  }
  @Get('users') @Permissions('settings.read') users(
    @CurrentUser() u: AuthUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.service.users(u, query);
  }
  @Post('users') @Permissions('settings.write') createUser(
    @CurrentUser() u: AuthUser,
    @Body() d: CreateUserDto,
  ) {
    return this.service.createUser(u, d);
  }
  @Patch('users/:id') @Permissions('settings.write') updateUser(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() d: UpdateUserDto,
  ) {
    return this.service.updateUser(u, id, d);
  }
}
