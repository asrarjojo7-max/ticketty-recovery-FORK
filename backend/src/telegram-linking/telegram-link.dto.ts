import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ConfirmTelegramLinkDto {
  @IsString()
  @MinLength(43)
  @MaxLength(43)
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token!: string;
}
