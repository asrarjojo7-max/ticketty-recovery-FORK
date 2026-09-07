import { Type } from 'class-transformer';
import {
  AccountType,
  AccountingEventType,
  JournalEntryStatus,
} from '@prisma/client';
import {
  ArrayMinSize,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

export class CreateAccountDto {
  @IsString() @IsNotEmpty() @MaxLength(40) code: string;
  @IsString() @IsNotEmpty() @MaxLength(200) name: string;
  @IsEnum(AccountType) type: AccountType;
  @IsOptional() @IsString() parentId?: string;
}

export class CreateFiscalPeriodDto {
  @IsInt() @Min(2000) @Max(2200) fiscalYear: number;
  @IsInt() @Min(1) @Max(13) periodNumber: number;
  @IsDateString() startsAt: string;
  @IsDateString() endsAt: string;
}

export class CreateJournalDto {
  @IsString() @IsNotEmpty() @MaxLength(40) code: string;
  @IsString() @IsNotEmpty() @MaxLength(160) name: string;
}

export class JournalLineDto {
  @IsString() accountId: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) debit: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) credit: number;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

export class CreateJournalEntryDto {
  @IsString() journalId: string;
  @IsString() fiscalPeriodId: string;
  @IsString() @IsNotEmpty() @MaxLength(60) entryNumber: string;
  @IsDateString() entryDate: string;
  @IsString() @IsNotEmpty() @MaxLength(80) sourceType: string;
  @IsString() @IsNotEmpty() sourceId: string;
  @IsString() @IsNotEmpty() @MaxLength(10) currency: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) description: string;
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines: JournalLineDto[];
}

export class ConfigureAccountingPolicyDto {
  @IsEnum(AccountingEventType) eventType: AccountingEventType;
  @IsString() journalId: string;
  @IsString() debitAccountId: string;
  @IsString() creditAccountId: string;
}

export class PostAccountingEventDto {
  @IsEnum(AccountingEventType) eventType: AccountingEventType;
  @IsString() @IsNotEmpty() sourceId: string;
  @IsString() fiscalPeriodId: string;
  @IsString() @IsNotEmpty() @MaxLength(60) entryNumber: string;
  @IsDateString() entryDate: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) description: string;
}

export class ReverseJournalEntryDto {
  @IsString() fiscalPeriodId: string;
  @IsString() @IsNotEmpty() @MaxLength(60) entryNumber: string;
  @IsDateString() entryDate: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) reason: string;
}

export class QueryJournalEntryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(JournalEntryStatus) status?: JournalEntryStatus;
}
