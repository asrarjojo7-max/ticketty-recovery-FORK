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
import {
  CreateExpenseAdjustmentDto,
  CreateExpenseDto,
  QueryExpenseDto,
  UpdateExpenseDto,
} from './dto';
import { ExpensesService } from './expenses.service';

/**
 * المصروفات — فئة "صنع/اعتماد التزام مالي": كل الكتابات بلا وسم
 * (= 'full' افتراضياً — fail-closed): create/update/approve/
 * adjust/remove → 402 عند EXPIRED/CANCELLED. القراءات exempt
 * (البيانات ملك الشركة).
 */
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @Permissions('expenses.write')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateExpenseDto) {
    return this.expensesService.create(user, dto);
  }

  @Get()
  @Permissions('expenses.read')
  @SubscriptionPolicy({
    mode: 'exempt',
    reason: 'قراءة المصروفات القائمة — البيانات ملك الشركة',
  })
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryExpenseDto) {
    return this.expensesService.findAll(user, query);
  }

  @Get(':id')
  @Permissions('expenses.read')
  @SubscriptionPolicy({
    mode: 'exempt',
    reason: 'قراءة مصروف قائم — البيانات ملك الشركة',
  })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.expensesService.findOne(user, id);
  }

  @Patch(':id')
  @Permissions('expenses.write')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expensesService.update(user, id, dto);
  }

  @Post(':id/approve')
  @Permissions('expenses.approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.expensesService.approve(user, id);
  }

  @Post(':id/adjustments')
  @Permissions('expenses.approve')
  adjust(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateExpenseAdjustmentDto,
  ) {
    return this.expensesService.adjust(user, id, dto);
  }

  @Delete(':id')
  @Permissions('expenses.write')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.expensesService.remove(user, id);
  }
}
