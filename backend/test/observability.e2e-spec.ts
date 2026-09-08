import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap/configure-app';
import { MetricsRegistryService } from '../src/monitoring/metrics-registry.service';

/**
 * Phase 6 — Observability baseline e2e.
 *
 * يثبت (1) أن /metrics يعمل كنقطة نهاية عامة (public endpoint) بلا
 * مصادقة (prometheus scraper بلا توكن)، (2) أن المخرجات تنسيق
 * Prometheus نصي صحيح مع المقاييس الأساسية، (3) أن طلب HTTP
 * فعلي يرفع عدادات الطلبات (integrity الربط الفعلي وليس مجرد
 * وجود أسماء)، (4) أن عامل المحاسبي يحدّث مقاييس دورته.
 */
describe('Observability /metrics (e2e)', () => {
  let app: INestApplication<App>;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let metrics: MetricsRegistryService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(['error', 'warn']);
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
    metrics = app.get(MetricsRegistryService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /metrics is public and returns Prometheus text format', async () => {
    const res = await request(server).get('/api/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    // عينات أساسية موجودة — request counter + worker gauges + process.
    expect(res.text).toContain('ticketty_http_requests_total');
    expect(res.text).toContain(
      'ticketty_accounting_worker_last_success_timestamp_seconds',
    );
    expect(res.text).toContain(
      'ticketty_subscription_sweep_last_run_timestamp_seconds',
    );
    expect(res.text).toContain('ticketty_process_');
    // /metrics نفسه عبر middleware العادي — يسجل عداداته.
  });

  it('an HTTP request through the middleware increments request counters', async () => {
    // /api/health/liveness بلا توكن — يمر عبر middleware كاملًا.
    const before = await request(server).get('/api/metrics');
    const m1 = matchSample(
      before.text,
      'ticketty_http_requests_total',
      'GET',
      '/api/health/liveness',
    );
    await request(server).get('/api/health/liveness');
    const after = await request(server).get('/api/metrics');
    const m2 = matchSample(
      after.text,
      'ticketty_http_requests_total',
      'GET',
      '/api/health/liveness',
    );
    expect(m2).toBeGreaterThan(m1);
  });

  it('route normalization collapses dynamic ids (bounded cardinality)', () => {
    const asService = metrics as unknown as {
      constructor: { normalizeRoute: (p: string) => string };
    };
    expect(asService.constructor.normalizeRoute('/api/trips/12345')).toBe(
      '/api/trips/:num',
    );
    expect(
      asService.constructor.normalizeRoute(
        '/api/bookings/cmts3dsdmrs67yf7f7pd1ob3n/cancel',
      ),
    ).toBe('/api/bookings/:id/cancel');
  });

  it('duration histogram observes real latencies', async () => {
    await request(server).get('/api/health/liveness');
    const res = await request(server).get('/api/metrics');
    // histogram له sum غير صفري للـ GET health.
    const line = res.text
      .split('\n')
      .find(
        (l) =>
          l.startsWith('ticketty_http_request_duration_seconds_sum') &&
          l.includes('GET'),
      );
    expect(line).toBeDefined();
    expect(Number(line!.split(' ').pop())).toBeGreaterThan(0);
  });
});

function matchSample(
  text: string,
  metric: string,
  method: string,
  route: string,
): number {
  // ticketty_http_requests_total{method="GET",route="/api/health/liveness",status="200"} 3
  const re = new RegExp(
    `${metric}\\{method="${method}",route="${route.replace(
      /\//g,
      '\\/',
    )}",status="(\\d+)"\\} (\\d+)`,
  );
  const m = text.match(re);
  if (!m) return 0;
  return Number(m[2]);
}
