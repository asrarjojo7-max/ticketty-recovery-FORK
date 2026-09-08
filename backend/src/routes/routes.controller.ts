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
import { CreateRouteDto, QueryRouteDto, UpdateRouteDto } from './dto';
import { RoutesService } from './routes.service';

@SubscriptionPolicy({
  mode: 'exempt',
  reason: 'إدارة خطوط السير — تجهيز بلا بيع',
})
@Controller('routes')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Post()
  @Permissions('routes.write')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRouteDto) {
    return this.routesService.create(user, dto);
  }

  @Get()
  @Permissions('routes.read')
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryRouteDto) {
    return this.routesService.findAll(user, query);
  }

  @Get(':id')
  @Permissions('routes.read')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.routesService.findOne(user, id);
  }

  @Patch(':id')
  @Permissions('routes.write')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRouteDto,
  ) {
    return this.routesService.update(user, id, dto);
  }

  @Delete(':id')
  @Permissions('routes.write')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.routesService.remove(user, id);
  }
}
