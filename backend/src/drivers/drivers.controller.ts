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
import { CreateDriverDto, QueryDriverDto, UpdateDriverDto } from './dto';
import { DriversService } from './drivers.service';

@SubscriptionPolicy({
  mode: 'exempt',
  reason: 'إدارة الأسطول البشري — قرار العقد §1: fleet متاحة عند الانتهاء',
})
@Controller('drivers')
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Post()
  @Permissions('fleet.write')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDriverDto) {
    return this.drivers.create(user, dto);
  }

  @Get()
  @Permissions('fleet.read')
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryDriverDto) {
    return this.drivers.findAll(user, query);
  }

  @Get(':id')
  @Permissions('fleet.read')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.drivers.findOne(user, id);
  }

  @Patch(':id')
  @Permissions('fleet.write')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateDriverDto,
  ) {
    return this.drivers.update(user, id, dto);
  }

  @Delete(':id')
  @Permissions('fleet.write')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.drivers.remove(user, id);
  }
}
