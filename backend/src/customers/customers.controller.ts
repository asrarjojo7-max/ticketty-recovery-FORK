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
import { CustomersService } from './customers.service';
import { CreateCustomerDto, QueryCustomerDto, UpdateCustomerDto } from './dto';

@SubscriptionPolicy({
  mode: 'exempt',
  reason: 'إدارة بيانات العملاء — ليست بيعاً ولا التزاماً مالياً',
})
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @Permissions('customers.write')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(user, dto);
  }

  @Get()
  @Permissions('customers.read')
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryCustomerDto) {
    return this.customersService.findAll(user, query);
  }

  @Get(':id')
  @Permissions('customers.read')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customersService.findOne(user, id);
  }

  @Patch(':id')
  @Permissions('customers.write')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(user, id, dto);
  }

  @Delete(':id')
  @Permissions('customers.write')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customersService.remove(user, id);
  }
}
