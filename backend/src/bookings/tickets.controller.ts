import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { SubscriptionPolicy } from '../common/decorators/subscription-policy.decorator';
import { QueryTicketDto } from './dto';
import { TicketsService } from './tickets.service';

@SubscriptionPolicy({
  mode: 'exempt',
  reason: 'قراءة تذاكر + check-in لما بِيع — خدمة ما بِيع',
})
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  @Permissions('tickets.read', 'tickets.read.own')
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryTicketDto) {
    return this.ticketsService.findAll(user, query);
  }

  @Get('by-qr/:qr')
  @Permissions('tickets.read', 'tickets.read.own')
  findByQr(@CurrentUser() user: AuthUser, @Param('qr') qr: string) {
    return this.ticketsService.findByQr(user, qr);
  }

  @Get(':id')
  @Permissions('tickets.read', 'tickets.read.own')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ticketsService.findOne(user, id);
  }

  @Post(':id/check-in')
  @Permissions('tickets.write', 'tickets.write.own')
  checkIn(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ticketsService.checkIn(user, id);
  }
}
