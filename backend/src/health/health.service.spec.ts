import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MetricsRegistryService } from '../monitoring/metrics-registry.service';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const config = (enabled: boolean) =>
    ({
      get: jest.fn((key: string) =>
        key === 'ACCOUNTING_WORKER_ENABLED' ? String(enabled) : undefined,
      ),
    }) as unknown as ConfigService;

  function fakeMetrics(
    lastSuccessSeconds = 0,
    consecutiveFailures = 0,
  ): { metrics: MetricsRegistryService; set: (v: number, f: number) => void } {
    let lastSuccess = lastSuccessSeconds;
    let failures = consecutiveFailures;
    // prom-client v15: Gauge.get() يعيد Promise<{values:[{value}]}>
    const metrics = {
      accountingWorkerLastSuccess: {
        get: () => Promise.resolve({ values: [{ value: lastSuccess }] }),
      },
      accountingWorkerConsecutiveFailures: {
        get: () => Promise.resolve({ values: [{ value: failures }] }),
      },
    } as unknown as MetricsRegistryService;
    return {
      metrics,
      set: (v: number, f: number) => {
        lastSuccess = v;
        failures = f;
      },
    };
  }

  it('reports liveness without requiring dependencies', () => {
    const prisma = {} as PrismaService;
    const { metrics } = fakeMetrics();
    expect(
      new HealthService(prisma, metrics, config(false)).liveness(),
    ).toEqual({
      status: 'ok',
    });
  });

  it('reports readiness when PostgreSQL responds, with worker staleness', async () => {
    const prisma = {
      ping: jest.fn().mockResolvedValue(undefined),
    } as unknown as PrismaService;
    const now = Math.floor(Date.now() / 1000);
    const { metrics } = fakeMetrics(now - 45, 0);
    const result = await new HealthService(
      prisma,
      metrics,
      config(true),
    ).readiness();
    expect(result.status).toBe('ready');
    expect(result.database).toBe('up');
    // نطاق سماحي: قد تمر ثانية بين التحضير والاستدعاء.
    expect(
      result.accountingWorker.secondsSinceLastSuccess,
    ).toBeGreaterThanOrEqual(45);
    expect(result.accountingWorker.secondsSinceLastSuccess).toBeLessThanOrEqual(
      120,
    );
    expect(result.accountingWorker.consecutiveFailures).toBe(0);
    expect(result.accountingWorker.state).toBe('healthy');
  });

  it('reports degraded when an enabled worker is failing', async () => {
    const prisma = {
      ping: jest.fn().mockResolvedValue(undefined),
    } as unknown as PrismaService;
    const { metrics } = fakeMetrics(Math.floor(Date.now() / 1000), 2);
    const result = await new HealthService(
      prisma,
      metrics,
      config(true),
    ).readiness();
    expect(result.status).toBe('degraded');
    expect(result.accountingWorker.state).toBe('failing');
  });

  it('reports degraded when an enabled worker never completed a cycle', async () => {
    const prisma = {
      ping: jest.fn().mockResolvedValue(undefined),
    } as unknown as PrismaService;
    const { metrics } = fakeMetrics(0, 0); // gauge untouched = 0
    const result = await new HealthService(
      prisma,
      metrics,
      config(true),
    ).readiness();
    expect(result.status).toBe('degraded');
    expect(result.accountingWorker.state).toBe('never_succeeded');
    expect(result.accountingWorker.secondsSinceLastSuccess).toBeNull();
  });

  it('reports an intentionally disabled worker distinctly from healthy', async () => {
    const prisma = {
      ping: jest.fn().mockResolvedValue(undefined),
    } as unknown as PrismaService;
    const { metrics } = fakeMetrics(0, 0);
    const result = await new HealthService(
      prisma,
      metrics,
      config(false),
    ).readiness();
    expect(result.status).toBe('ready');
    expect(result.accountingWorker).toMatchObject({
      enabled: false,
      state: 'disabled',
      secondsSinceLastSuccess: null,
    });
  });

  it('fails readiness without leaking the database error', async () => {
    const prisma = {
      ping: jest.fn().mockRejectedValue(new Error('secret connection data')),
    } as unknown as PrismaService;
    const { metrics } = fakeMetrics();
    await expect(
      new HealthService(prisma, metrics, config(true)).readiness(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
