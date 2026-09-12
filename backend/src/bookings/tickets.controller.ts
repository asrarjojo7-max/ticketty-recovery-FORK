import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { SubscriptionPolicy } from '../common/decorators/subscription-policy.decorator';
import { QueryTicketDto } from './dto';
import { TicketsService } from './tickets.service';
import { IsIn } from 'class-validator';

export class ValidateTicketDto {
  /** قيمة الباركود (TB-…) أو QR أو رقم التذكرة المطبوع (TK-…). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code: string;

  /** بوابة رحلة محددة (اختياري) — يرفض تذكرة رحلة أخرى. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  tripId?: string;
}

export class MarkPrintedDto {
  @IsOptional()
  @IsIn([true])
  printed?: true;
}

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

  /**
   * التحقق الرسمي من الباركود/الرقم: الخادم يسترجع التذكرة الحقيقية
   * ويعيد حالة معيارية (VALID / CANCELLED / ALREADY_BOARDED / …).
   */
  @Post('validate')
  @Permissions('tickets.read', 'tickets.read.own')
  validate(@CurrentUser() user: AuthUser, @Body() dto: ValidateTicketDto) {
    return this.ticketsService.validate(user, dto.code, dto.tripId);
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

  /** تسجيل طباعة التذكرة (تدقيق) — يُستدعى عند الضغط "طباعة". */
  @Post(':id/printed')
  @Permissions('tickets.write', 'tickets.write.own')
  markPrinted(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ticketsService.markPrinted(user, id);
  }
}
