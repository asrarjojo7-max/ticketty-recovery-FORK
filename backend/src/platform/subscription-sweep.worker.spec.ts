import { ConfigService } from '@nestjs/config';
import { SubscriptionSweepWorker } from './subscription-sweep.worker';
import type { PrismaService } from '../prisma/prisma.service';

function makeConfig(env: Record<string, string>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

describe('SubscriptionSweepWorker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function makeWorker(env: Record<string, string>, sweep = jest.fn()) {
    const prisma = { runSubscriptionSweep: sweep } as unknown as PrismaService;
    const worker = new SubscriptionSweepWorker(prisma, makeConfig(env));
    return { worker, sweep };
  }

  it('does nothing when disabled (default — dev-safe, prod enables)', () => {
    const { worker, sweep } = makeWorker({});
    worker.onModuleInit();
    expect(sweep).not.toHaveBeenCalled();
    expect((worker as unknown as { timer?: unknown }).timer).toBeUndefined();
  });

  it('runs once at boot then every interval when enabled', async () => {
    const { worker, sweep } = makeWorker({
      SUBSCRIPTION_SWEEP_ENABLED: 'true',
      SUBSCRIPTION_SWEEP_INTERVAL_MS: '1000',
    });
    sweep.mockResolvedValue(0);
    worker.onModuleInit();
    await Promise.resolve();
    expect(sweep).toHaveBeenCalledTimes(1); // boot run
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    expect(sweep.mock.calls.length).toBeGreaterThanOrEqual(2);
    worker.onModuleDestroy();
  });

  it('is idempotent under re-entry (running lock returns 0 immediately)', async () => {
    const { worker, sweep } = makeWorker({
      SUBSCRIPTION_SWEEP_ENABLED: 'true',
    });
    let release: (() => void) | undefined;
    sweep.mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          release = () => resolve(0);
        }),
    );
    const first = worker.runOnce();
    const second = await worker.runOnce(); // re-entrant call during first run
    expect(second).toBe(0);
    expect(sweep).toHaveBeenCalledTimes(1);
    release?.();
    await first;
  });

  it('recovers after failure (atomic txn — no partial effects, next try proceeds)', async () => {
    const { worker, sweep } = makeWorker({
      SUBSCRIPTION_SWEEP_ENABLED: 'true',
    });
    sweep.mockRejectedValueOnce(new Error('connection lost'));
    const failed = await worker.runOnce();
    expect(failed).toBe(-1);
    expect((worker as unknown as { running: boolean }).running).toBe(false); // retry-ready
    sweep.mockResolvedValueOnce(2);
    const retried = await worker.runOnce();
    expect(retried).toBe(2); // worker retry edge case (Contract §5)
  });

  it('clears the timer on destroy', () => {
    const { worker } = makeWorker({
      SUBSCRIPTION_SWEEP_ENABLED: 'true',
      SUBSCRIPTION_SWEEP_INTERVAL_MS: '1000',
    });
    worker.onModuleInit();
    const timer = (worker as unknown as { timer?: { unref?: unknown } }).timer;
    expect(timer).toBeDefined();
    worker.onModuleDestroy();
    expect((worker as unknown as { timer?: unknown }).timer).toBeUndefined();
  });

  it('falls back to the 6h default for malformed intervals', () => {
    const { worker } = makeWorker({
      SUBSCRIPTION_SWEEP_ENABLED: 'true',
      SUBSCRIPTION_SWEEP_INTERVAL_MS: 'not-a-number',
    });
    worker.onModuleInit();
    expect((worker as unknown as { timer?: unknown }).timer).toBeDefined();
    worker.onModuleDestroy();
  });
});
