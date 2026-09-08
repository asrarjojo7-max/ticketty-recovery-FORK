import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Health — liveness/readiness (Phase 6 توسعة، لا استبدال).
 *
 * جاهزية العامل المحاسبي: **degraded وليس not-ready** (عقد §12.4) —
 * تذبذب worker لا يقتل الحاوية (kubernetes readiness gate) لكنه
 * يظهر في الحمولة للمراقبة. القاعدة: DB up = ready؛ العامل جزء
 * من الحمولة فقط.
 */
@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

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
    // جاهزية العامل: degraded وليس not-ready — لا تقتل الحاوية
    // بسبب تذبذب worker؛ الظهور في الحمولة للمراقبة فقط. تعطل هذا
    // الاستعلام كلياً (نوعيًا أو اتصالياً) لا يغير الجاهزية أبداً.
    let stalePending = -1;
    try {
      const rows = await this.prisma.$queryRaw<Array<{ count: number }>>`
        SELECT count(*)::int AS count FROM accounting_events
        WHERE status = 'PENDING' AND "createdAt" < now() - interval '10 minutes'`;
      stalePending = Number(rows[0]?.count ?? 0);
    } catch {
      /* -1 = تعذر القياس — الجاهزية لا تتأثر */
    }
    return {
      status: 'ready' as const,
      database: 'up' as const,
      // أحداث معلقة أقدم من 10 دقائق — إن ظهرت فالعامل متوقف
      // عملياً (الرصد العملي في /metrics + alert rules).
      stalePendingAccountingEvents: stalePending,
    };
  }
}
