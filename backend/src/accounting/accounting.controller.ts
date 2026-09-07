import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { AccountingService } from './accounting.service';
import {
  ConfigureAccountingPolicyDto,
  CreateAccountDto,
  CreateFiscalPeriodDto,
  CreateJournalDto,
  CreateJournalEntryDto,
  PostAccountingEventDto,
  QueryJournalEntryDto,
  ReverseJournalEntryDto,
} from './dto';

@Controller('accounting')
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  @Post('accounts')
  @Permissions('accounting.write')
  createAccount(@CurrentUser() user: AuthUser, @Body() dto: CreateAccountDto) {
    return this.accounting.createAccount(user, dto);
  }

  @Get('accounts')
  @Permissions('accounting.read')
  listAccounts(@CurrentUser() user: AuthUser) {
    return this.accounting.listAccounts(user);
  }

  @Get('periods')
  @Permissions('accounting.read')
  listPeriods(@CurrentUser() user: AuthUser) {
    return this.accounting.listPeriods(user);
  }

  @Post('periods')
  @Permissions('accounting.write')
  createPeriod(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateFiscalPeriodDto,
  ) {
    return this.accounting.createPeriod(user, dto);
  }

  @Post('periods/:id/close')
  @Permissions('accounting.close')
  closePeriod(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accounting.closePeriod(user, id);
  }

  @Get('journals')
  @Permissions('accounting.read')
  listJournals(@CurrentUser() user: AuthUser) {
    return this.accounting.listJournals(user);
  }

  @Post('journals')
  @Permissions('accounting.write')
  createJournal(@CurrentUser() user: AuthUser, @Body() dto: CreateJournalDto) {
    return this.accounting.createJournal(user, dto);
  }

  @Get('policies')
  @Permissions('accounting.read')
  listPolicies(@CurrentUser() user: AuthUser) {
    return this.accounting.listPolicies(user);
  }

  @Post('policies')
  @Permissions('accounting.write')
  configurePolicy(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfigureAccountingPolicyDto,
  ) {
    return this.accounting.configurePolicy(user, dto);
  }

  @Get('reconciliation')
  @Permissions('accounting.read')
  reconciliation(@CurrentUser() user: AuthUser) {
    return this.accounting.reconciliation(user);
  }

  @Get('events')
  @Permissions('accounting.read')
  listEvents(@CurrentUser() user: AuthUser) {
    return this.accounting.listEvents(user);
  }

  @Post('events/process-next')
  @Permissions('accounting.post')
  processNextEvent(@CurrentUser() user: AuthUser) {
    return this.accounting.processNextEvent(user);
  }

  @Post('events/:id/requeue')
  @Permissions('accounting.post')
  requeueEvent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accounting.requeueEvent(user, id);
  }

  @Post('events/:id/process')
  @Permissions('accounting.post')
  processEvent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accounting.processEvent(user, id);
  }

  @Post('events/post')
  @Permissions('accounting.post')
  postBusinessEvent(
    @CurrentUser() user: AuthUser,
    @Body() dto: PostAccountingEventDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.accounting.postBusinessEvent(user, dto, idempotencyKey);
  }

  @Post('entries')
  @Permissions('accounting.write')
  createEntry(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateJournalEntryDto,
  ) {
    return this.accounting.createEntry(user, dto);
  }

  @Get('entries')
  @Permissions('accounting.read')
  listEntries(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryJournalEntryDto,
  ) {
    return this.accounting.listEntries(user, query);
  }

  @Post('entries/:id/post')
  @Permissions('accounting.post')
  postEntry(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accounting.postEntry(user, id);
  }

  @Post('entries/:id/reverse')
  @Permissions('accounting.post')
  reverseEntry(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReverseJournalEntryDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.accounting.reverseEntry(user, id, dto, idempotencyKey);
  }
}
