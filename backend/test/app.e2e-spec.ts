import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/bootstrap/configure-app';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('/api (GET)', () => {
    return request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect('Hello World!');
  });

  it('/api/health/liveness (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health/liveness')
      .set('X-Request-Id', 'e2e-health-check')
      .expect('X-Content-Type-Options', 'nosniff')
      .expect('X-Request-Id', 'e2e-health-check')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('/api/health/readiness (GET)', () => {
    return (
      request(app.getHttpServer())
        .get('/api/health/readiness')
        .expect(200)
        // Phase 6: مؤشر العامل (degraded، لا not-ready) — ثواني منذ
        // آخر نجاح وعدد الفشل المتتابع. -1 = العامل لم يكمل دورة
        // منذ الإقلاع (خمول dev شائع) — لا يؤثر على الجاهزية.
        .expect((res: { body: Record<string, unknown> }) => {
          if (res.body.status !== 'ready' || res.body.database !== 'up') {
            throw new Error(
              `unexpected readiness body: ${JSON.stringify(res.body)}`,
            );
          }
          const worker = res.body.accountingWorker as
            | { secondsSinceLastSuccess: unknown; consecutiveFailures: unknown }
            | undefined;
          if (!worker) {
            throw new Error('accountingWorker object missing');
          }
          if (
            typeof worker.secondsSinceLastSuccess !== 'number' ||
            typeof worker.consecutiveFailures !== 'number'
          ) {
            throw new Error('accountingWorker fields must be numbers');
          }
        })
    );
  });

  it('returns a stable validation error envelope', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ unexpected: true })
      .expect(400);

    const body = response.body as { message?: unknown };
    expect(body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(body.message).toEqual(expect.any(Array));
  });

  it('returns a stable sanitized error envelope', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/does-not-exist')
      .expect(404);

    const body = response.body as { requestId?: unknown };
    expect(response.headers['x-request-id']).toBe(body.requestId);
    expect(body).toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    expect(body).not.toHaveProperty('stack');
  });

  afterEach(async () => {
    await app.close();
  });
});
