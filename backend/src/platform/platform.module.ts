import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { SubscriptionSweepWorker } from './subscription-sweep.worker';

/**
 * وحدة إدارة المنصة — Provisioning الـ Tenants.
 * لا تستورد أي وحدة عميل: عملياتها على مستوى المنصة ككل،
 * والوصول مقيّد بصلاحية platform.admin + انتماء منظمة المشغّل.
 */
@Module({
  controllers: [PlatformController],
  providers: [PlatformService, SubscriptionSweepWorker],
})
export class PlatformModule {}
