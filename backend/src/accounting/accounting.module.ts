import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingEventWorker } from './accounting-event.worker';
import { AccountingService } from './accounting.service';

@Module({
  controllers: [AccountingController],
  providers: [AccountingService, AccountingEventWorker],
})
export class AccountingModule {}
