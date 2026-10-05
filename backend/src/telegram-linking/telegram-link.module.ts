import { Module } from '@nestjs/common';
import { TelegramLinkController } from './telegram-link.controller';
import { TelegramLinkService } from './telegram-link.service';

@Module({
  controllers: [TelegramLinkController],
  providers: [TelegramLinkService],
})
export class TelegramLinkModule {}
