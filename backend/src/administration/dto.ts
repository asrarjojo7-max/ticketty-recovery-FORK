import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateOrganizationDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(2000) ticketTerms?: string;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  cancellationFeePercent?: number;
}
export class UpdateTicketBrandingDto {
  @IsOptional() @IsString() @MaxLength(180) tagline?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'لون الهوية الرئيسي يجب أن يكون بصيغة #RRGGBB',
  })
  primaryColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'لون الهوية الثانوي يجب أن يكون بصيغة #RRGGBB',
  })
  secondaryColor?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  checkInMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  baggagePieces?: number;
}

export class CreateBranchDto {
  @IsString() @IsNotEmpty() @MaxLength(150) name: string;
  @IsString() @IsNotEmpty() @MaxLength(100) city: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
}
export class CreateRoleDto {
  @IsString() @IsNotEmpty() @MaxLength(50) key: string;
  @IsString() @IsNotEmpty() @MaxLength(100) nameAr: string;
  @IsString() @IsNotEmpty() @MaxLength(100) nameEn: string;
  @IsArray() @IsString({ each: true }) permissions: string[];
}
export class CreateUserDto {
  @IsString() @IsNotEmpty() @MaxLength(150) name: string;
  @IsEmail() @MaxLength(254) email: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsString() @MinLength(12) @MaxLength(128) password: string;
  @IsString() @IsNotEmpty() roleId: string;
  @IsOptional() @IsString() branchId?: string;
}
export class UpdateUserDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150) name?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() roleId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
