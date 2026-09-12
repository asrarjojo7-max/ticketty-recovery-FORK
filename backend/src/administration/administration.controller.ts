import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { SubscriptionPolicy } from '../common/decorators/subscription-policy.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import {
  AdministrationService,
  ticketBrandAssetKind,
} from './administration.service';
import {
  CreateBranchDto,
  CreateRoleDto,
  CreateUserDto,
  UpdateOrganizationDto,
  UpdateTicketBrandingDto,
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
  @Get('organization/ticket-profile')
  @Permissions(
    'settings.read',
    'bookings.read',
    'bookings.read.own',
    'bookings.write',
    'bookings.write.own',
  )
  ticketProfile(@CurrentUser() u: AuthUser) {
    return this.service.organization(u);
  }

  @Patch('organization') @Permissions('settings.write') updateOrganization(
    @CurrentUser() u: AuthUser,
    @Body() d: UpdateOrganizationDto,
  ) {
    return this.service.updateOrganization(u, d);
  }
  @Patch('organization/ticket-branding')
  @Permissions('settings.write')
  updateTicketBranding(
    @CurrentUser() u: AuthUser,
    @Body() d: UpdateTicketBrandingDto,
  ) {
    return this.service.updateTicketBranding(u, d);
  }

  @Post('organization/ticket-branding/assets/:kind')
  @Permissions('settings.write')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { files: 1, fileSize: 8 * 1024 * 1024 },
    }),
  )
  uploadTicketBrandAsset(
    @CurrentUser() u: AuthUser,
    @Param('kind') kind: string,
    @UploadedFile() file?: { buffer: Buffer; size: number },
  ) {
    return this.service.setTicketBrandAsset(
      u,
      ticketBrandAssetKind(kind),
      file,
    );
  }

  @Get('organization/ticket-branding/assets/:kind')
  @Permissions(
    'settings.read',
    'bookings.read',
    'bookings.read.own',
    'bookings.write',
    'bookings.write.own',
  )
  async ticketBrandAsset(
    @CurrentUser() u: AuthUser,
    @Param('kind') kind: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const asset = await this.service.ticketBrandAsset(
      u,
      ticketBrandAssetKind(kind),
    );
    response.set({
      'Cache-Control': 'private, no-cache',
      ETag: `"${asset.sha256}"`,
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(asset.buffer, {
      type: asset.mime,
      disposition: 'inline',
      length: asset.buffer.length,
    });
  }

  @Delete('organization/ticket-branding/assets/:kind')
  @Permissions('settings.write')
  deleteTicketBrandAsset(
    @CurrentUser() u: AuthUser,
    @Param('kind') kind: string,
  ) {
    return this.service.deleteTicketBrandAsset(u, ticketBrandAssetKind(kind));
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
