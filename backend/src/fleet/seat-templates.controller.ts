import {
  Body,
  Controller,
  Delete,
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
import { requireOrgId } from '../common/org';
import {
  CreateSeatTemplateDto,
  QueryFleetDto,
  UpdateSeatTemplateDto,
} from './dto';
import { SeatTemplatesService } from './seat-templates.service';

@SubscriptionPolicy({
  mode: 'exempt',
  reason: 'إدارة قوالب المقاعد — تجهيز بلا بيع',
})
@Controller('seat-templates')
export class SeatTemplatesController {
  constructor(private readonly service: SeatTemplatesService) {}

  @Post()
  @Permissions('fleet.write')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSeatTemplateDto) {
    return this.service.create(requireOrgId(user), dto);
  }

  @Get()
  @Permissions('fleet.read')
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryFleetDto) {
    return this.service.findAll(requireOrgId(user), query);
  }

  @Get(':id')
  @Permissions('fleet.read')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(requireOrgId(user), id);
  }

  @Patch(':id')
  @Permissions('fleet.write')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSeatTemplateDto,
  ) {
    return this.service.update(requireOrgId(user), id, dto);
  }

  @Delete(':id')
  @Permissions('fleet.write')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(requireOrgId(user), id);
  }
}
