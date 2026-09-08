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
import { BusesService } from './buses.service';
import { CreateBusDto, QueryFleetDto, UpdateBusDto } from './dto';

@SubscriptionPolicy({
  mode: 'exempt',
  reason: 'إدارة الأسطول — قرار العقد §1: fleet متاحة عند الانتهاء',
})
@Controller('buses')
export class BusesController {
  constructor(private readonly service: BusesService) {}

  @Post()
  @Permissions('fleet.write')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBusDto) {
    return this.service.create(user, dto);
  }

  @Get()
  @Permissions('fleet.read')
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryFleetDto) {
    return this.service.findAll(user, query);
  }

  @Get(':id')
  @Permissions('fleet.read')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Patch(':id')
  @Permissions('fleet.write')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBusDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Delete(':id')
  @Permissions('fleet.write')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
