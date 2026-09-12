import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsRegistryService } from '../monitoring/metrics-registry.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Health — liveness/readiness (Phase 6 توسعة، لا استبدال).
 *
 * جاهزية العامل المحاسبي: **degraded وليس not-ready** (عقد §12.4) —
 * تذبذب worker لا يقتل الحاوية (kubernetes readiness gate) لكنه
 * يظهر في الحمولة للمراقبة. القاعدة: DB up = ready؛ العامل جزء
 * من الحمولة فقط.
 *
 * ملاحظة تصميمية: مؤشر العامل هنا يُقرأ من عدادات prom-client
 * (المصدر نفسه الذي تقرأه قواعد التنبيه) — لا استعلام DB إضافي
 * في مسار الجاهزية، ولا تجاوز لسياق tenant (الـ PrismaService
 * يرفض الاستعلامات الخام بلا سياق — fail-closed مقصود).
 */
@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsRegistryService,
    private readonly config: ConfigService,
  ) {}

  liveness() {
    return { status: 'ok' as const };
  }

  async readiness() {
    try {
      await this.prisma.ping();
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        database: 'down',
      });
    }
    // ثوانٍ منذ آخر دورة ناجحة للعامل المحاسبي — من نفس العداد
    // الذي تقرأه قواعد التنبيه (AccountingWorkerStale). gauge لا
    // يُكتب إلا بعد أول دورة كاملة؛ 0 = لم يكتمل بعد (خمول dev
    // شائع) → -1 = "غير معروف بعد" — degraded فقط، لا not-ready.
    // prom-client v15: Gauge.get() وعد يعيد {values} — نستخرج
    // قيمة الليبل الفارغ (العداد scalar بلا ليبلات). غياب النجاح لا
    // يُحوّل إلى رقم سالب يبدو سليماً: worker المفعّل يصبح degraded.
    const [lastSuccessAgg, failuresAgg] = await Promise.all([
      this.metrics.accountingWorkerLastSuccess.get(),
      this.metrics.accountingWorkerConsecutiveFailures.get(),
    ]);
    const lastSuccess = lastSuccessAgg.values[0]?.value ?? 0;
    const failures = failuresAgg.values[0]?.value ?? 0;
    const secondsSinceSuccess =
      lastSuccess > 0
        ? Math.max(0, Math.round(Date.now() / 1000 - lastSuccess))
        : null;
    const enabled =
      this.config.get<string>('ACCOUNTING_WORKER_ENABLED') === 'true';
    const staleAfterSeconds = 15 * 60;
    const workerState = !enabled
      ? ('disabled' as const)
      : lastSuccess <= 0
        ? ('never_succeeded' as const)
        : failures > 0
          ? ('failing' as const)
          : secondsSinceSuccess !== null &&
              secondsSinceSuccess > staleAfterSeconds
            ? ('stale' as const)
            : ('healthy' as const);
    return {
      status:
        workerState === 'healthy' || workerState === 'disabled'
          ? ('ready' as const)
          : ('degraded' as const),
      database: 'up' as const,
      accountingWorker: {
        enabled,
        state: workerState,
        secondsSinceLastSuccess: secondsSinceSuccess,
        consecutiveFailures: failures,
      },
    };
  }
}
