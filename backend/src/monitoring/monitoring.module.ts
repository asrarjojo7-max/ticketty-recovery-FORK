import { Global, Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsRegistryService } from './metrics-registry.service';

/**
 * وحدة المراقبة (Phase 6) — عالمية لأن request-context middleware
 * وworkers من وحدات مختلفة يستعملون السجل دون استيراد كل واحد
 * الوحدة (حل الاعتماد الدائري النمطي لـ APP_GUARD/middleware).
 */
@Global()
@Module({
  providers: [MetricsRegistryService],
  controllers: [MetricsController],
  exports: [MetricsRegistryService],
})
export class MonitoringModule {}
