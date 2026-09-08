import { BookingStatus, PaymentMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class HoldSeatDto {
  @IsString()
  @IsNotEmpty()
  tripId: string;

  @IsString()
  @IsNotEmpty()
  seatId: string;
}

export class ReleaseSeatDto {
  @IsString()
  @IsNotEmpty()
  seatId: string;
}

export class BookingPassengerDto {
  @IsString()
  @IsNotEmpty()
  seatId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  passengerName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  passengerPhone: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  passengerNationalId?: string;
}

export class CreateBookingDto {
  @IsString()
  @IsNotEmpty()
  tripId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  seatIds: string[];

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => BookingPassengerDto)
  passengers?: BookingPassengerDto[];

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  passengerName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  passengerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  passengerNationalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  boardingStop?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  dropOffStop?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  agentId?: string;

  /**
   * Phase 5 (Option A — Owner-approved): قصر الدفع على النقد فقط.
   *
   * القيم الرقمية (CARD/BANKAK/MTN_MOMO/ZAIN_CASH/BANK_TRANSFER) تبقى
   * في الـ enum كـ reserved & documented — تسجيلها مستحيل عبر الـ API
   * حتى وجود سياسة providers + reconciliation (قرار المالك: providers
   * مؤجلة). هذا يمنع "phantom payment" من الجذر: تأكيد رقمي بلا تحقق
   * خارجي كان يخلق تذكرة مؤكدة + إيرادًا مسجلًا من لا شيء.
   * عند أول حاجة فعلية للبيع الرقمي: راجع PRE-LAUNCH_HARDENING_PLAN
   * §5.3 Option B (verification workflow) — التصميم موثق كاملًا.
   */
  @IsIn([PaymentMethod.CASH], {
    message:
      'الطرق الرقمية غير متاحة بعد — الدفع نقدًا فقط (الطرق الرقمية محفوظة حتى سياسة التحقق)',
  })
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CancelBookingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class QueryTicketDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  tripId?: string;
}

export class QueryBookingDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  tripId?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}
