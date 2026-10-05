import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ConfirmTelegramLinkDto } from './telegram-link.dto';
import { TelegramLinkService } from './telegram-link.service';

@Controller('telegram/link')
export class TelegramLinkController {
  constructor(private readonly service: TelegramLinkService) {}

  @Post('challenge')
  async createChallenge(@CurrentUser() user: AuthUser) {
    return this.service.createChallenge(user);
  }

  @Post('confirm')
  async confirm(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfirmTelegramLinkDto,
  ) {
    return this.service.confirm(user, dto.token);
  }

  @Get()
  async current(@CurrentUser() user: AuthUser) {
    return this.service.current(user);
  }

  @Post('revoke')
  async revoke(@CurrentUser() user: AuthUser) {
    return this.service.revoke(user);
  }

  @Public()
  @Post('internal/attach')
  async attach(
    @Headers('x-ticketty-telegram-timestamp') timestamp: string,
    @Headers('x-ticketty-telegram-signature') signature: string,
    @Body() body: { token?: string; telegramUserId?: string; telegramChatId?: string },
  ) {
    if (!timestamp || !signature || !body.token || !body.telegramUserId || !body.telegramChatId) {
      throw new UnauthorizedException('بيانات Telegram الداخلية ناقصة');
    }
    const canonical = [
      'POST',
      '/api/telegram/link/internal/attach',
      timestamp,
      body.token,
      body.telegramUserId,
      body.telegramChatId,
    ].join('\n');
    await this.service.verifyInternalSignature(timestamp, signature, canonical);
    return this.service.attachTelegramIdentity(
      body.token,
      body.telegramUserId,
      body.telegramChatId,
    );
  }
}
