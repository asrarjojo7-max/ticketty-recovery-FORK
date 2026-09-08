import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { SubscriptionPolicy } from '../common/decorators/subscription-policy.decorator';
import {
  CancelTripDto,
  CreateTripDto,
  QueryTripDto,
  UpdateTripDto,
} from './dto';
import { TripsService } from './trips.service';

@SubscriptionPolicy({
  mode: 'exempt',
  reason: 'إدارة الرحلات — قرار العقد §1: trips متاحة عند الانتهاء',
})
@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post()
  @Permissions('trips.write')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTripDto) {
    return this.tripsService.create(user, dto);
  }

  @Get()
  @Permissions('trips.read')
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryTripDto) {
    return this.tripsService.findAll(user, query);
  }

  @Get(':id')
  @Permissions('trips.read')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tripsService.findOne(user, id);
  }

  @Get(':id/seats')
  @Permissions('trips.read')
  seats(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tripsService.seats(user, id);
  }

  @Patch(':id')
  @Permissions('trips.write')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTripDto,
  ) {
    return this.tripsService.update(user, id, dto);
  }

  @Post(':id/cancel')
  @Permissions('trips.write')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CancelTripDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.tripsService.cancel(user, id, dto.reason, idempotencyKey);
  }

  @Delete(':id')
  @Permissions('trips.write')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tripsService.remove(user, id);
  }
}
