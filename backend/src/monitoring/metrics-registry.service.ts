import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

/**
 * سجل المقاييس المركزي — Phase 6 (Observability Baseline).
 *
 * المبدأ (عقد الهندسة §12): الحد الأدنى المفيد والموثوق قبل أول
 * عميل — dependency واحدة (prom-client)، بلا hosted service، بلا
 * تغيير أي منطق أعمال.
 *
 * المصدر الوحيد لكل المقاييس في التطبيق. التسمية صريحة
 * metricName+help (Prometheus best practice) وكل الأسماء
 * namespaced بـ ticketty_ ما عدا مقاييس العملية الافتراضية.
 */
@Injectable()
export class MetricsRegistryService implements OnModuleDestroy {
  private readonly logger = new Logger(MetricsRegistryService.name);
  readonly registry = new Registry();

  /** http_requests_total{route,status} — من request-context middleware. */
  readonly httpRequestsTotal: Counter<string> = new Counter({
    name: 'ticketty_http_requests_total',
    help: 'Total HTTP requests by normalized route and status code',
    labelNames: ['method', 'route', 'status'],
    registers: [this.registry],
  });

  /** http_request_duration_seconds — histogram نفس الليبلات. */
  readonly httpRequestDuration: Histogram<string> = new Histogram({
    name: 'ticketty_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  /** 402 SUBSCRIPTION_REQUIRED counter — يربط Phase 1 بالمراقبة. */
  readonly subscriptionBlocksTotal: Counter<string> = new Counter({
    name: 'ticketty_subscription_blocks_total',
    help: 'Requests rejected with 402 SUBSCRIPTION_REQUIRED (expired/cancelled tenant)',
    labelNames: ['route'],
    registers: [this.registry],
  });

  /** accounting_queue_depth{status} — gauge من استعلام دوري. */
  readonly accountingQueueDepth: Gauge<string> = new Gauge({
    name: 'ticketty_accounting_queue_depth',
    help: 'Accounting events pending processing by status',
    labelNames: ['status'],
    registers: [this.registry],
  });

  readonly accountingEventsProcessedTotal: Counter<string> = new Counter({
    name: 'ticketty_accounting_events_processed_total',
    help: 'Accounting events successfully posted by the worker',
    registers: [this.registry],
  });

  readonly accountingEventsFailedTotal: Counter<string> = new Counter({
    name: 'ticketty_accounting_events_failed_total',
    help: 'Accounting events that failed processing (marked FAILED, retried)',
    registers: [this.registry],
  });

  /** إجابة "إذا توقف العامل نعرف تلقائيًا" — قاعدة التنبيه: */
  readonly accountingWorkerLastSuccess: Gauge<string> = new Gauge({
    name: 'ticketty_accounting_worker_last_success_timestamp_seconds',
    help: 'Unix timestamp of the last successful worker cycle (any outcome incl. idle)',
    registers: [this.registry],
  });

  readonly accountingWorkerConsecutiveFailures: Gauge<string> = new Gauge({
    name: 'ticketty_accounting_worker_consecutive_failures',
    help: 'Consecutive worker cycles that threw (DB down, claim error) — alert if > 0 for 10m',
    registers: [this.registry],
  });

  /** نفس نمط العامل المحاسبي للسحّال (Phase 1). */
  readonly subscriptionSweepLastRun: Gauge<string> = new Gauge({
    name: 'ticketty_subscription_sweep_last_run_timestamp_seconds',
    help: 'Unix timestamp of the last subscription sweep execution',
    registers: [this.registry],
  });

  readonly subscriptionSweepLastResult: Gauge<string> = new Gauge({
    name: 'ticketty_subscription_sweep_last_result',
    help: 'Result of last sweep: 1 = success (transitions applied or clean), 0 = error',
    registers: [this.registry],
  });

  constructor() {
    // process metrics: event loop lag, memory, GC — من prom-client.
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'ticketty_process_',
    });
  }

  /** تنسيق Prometheus النصي لـ GET /metrics. */
  async render(): Promise<string> {
    return this.registry.metrics();
  }

  onModuleDestroy(): void {
    // prom-client v15: Registry.clear() (لا يوجد close) — تفريغ
    // العدادات عند إيقاف العملية لتفادي double-register عند HMR.
    try {
      this.registry.clear();
    } catch {
      /* إيقاف العملية — best-effort */
    }
  }

  /** عادِ الأسماء من الأرقام — أداة مشتركة للعدادات الوسيطة. */
  static normalizeRoute(path: string): string {
    // تقليص الأجزاء الديناميكية (uuids/cuids/أرقام) إلى :param
    // لتجنب انفجار الليبلات — نفس قاعدة cardinality في ممارسات
    // Prometheus. نعمل على مستوى "الجزء الكامل" (segment): أي جزء
    // مسار يطابق نمط معرف ديناميكي (uuid، cuid2 المستخدم في هذا
    // المشروع cmt...) أو رقمًا صرفًا يُقلص إلى :id/:num — لا نستبدل
    // الأرقام داخل النص لأن ذلك يفسد أسماء المسارات الثابتة.
    return path
      .split('/')
      .map((segment) => {
        if (segment === '') return segment;
        // UUID كامل.
        if (
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            segment,
          )
        )
          return ':id';
        // cuid2 (بادئة المشروع cmt + قاعدة base36 طويلة) أو أي
        // معرف قاعدي طويل يحتوي أرقامًا وحروفًا مختلطة بأكثر من 12 خانة.
        if (/^c[a-z0-9]{12,}$/i.test(segment)) return ':id';
        // رقم صرف (سنوات/معرفات رقمية).
        if (/^\d+$/.test(segment)) return ':num';
        return segment;
      })
      .join('/');
  }
}
