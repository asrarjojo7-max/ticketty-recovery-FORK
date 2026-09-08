import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { SubscriptionPolicy } from '../common/decorators/subscription-policy.decorator';
import { QueryPaymentDto } from './dto';
import { PaymentsService } from './payments.service';

@SubscriptionPolicy({
  mode: 'exempt',
  reason: 'قراءة مدفوعات قائمة — لا يوجد POST في هذا الصنف',
})
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @Permissions('payments.read', 'payments.read.own')
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryPaymentDto) {
    return this.paymentsService.findAll(user, query);
  }

  @Get(':id')
  @Permissions('payments.read', 'payments.read.own')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.paymentsService.findOne(user, id);
  }
}
