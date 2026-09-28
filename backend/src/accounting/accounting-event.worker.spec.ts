import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingEventWorker } from './accounting-event.worker';
import { MetricsRegistryService } from '../monitoring/metrics-registry.service';
import { AccountingService } from './accounting.service';

describe('AccountingEventWorker', () => {
  it('claims and processes one event in its tenant context', async () => {
    const claim = jest
      .fn()
      .mockResolvedValue({ id: 'event-1', organizationId: 'org-1' });
    const withTenant = jest.fn(
      (_organizationId: string, callback: () => Promise<unknown>) => callback(),
    );
    const processEvent = jest.fn().mockResolvedValue({ id: 'entry-1' });
    const queueDepth = jest
      .fn()
      .mockResolvedValue([{ status: 'PENDING', count: 2 }]);
    const prisma = {
      claimAccountingEvent: claim,
      withTenantContext: withTenant,
      accountingQueueDepth: queueDepth,
    } as unknown as PrismaService;
    const accounting = { processEvent } as unknown as AccountingService;
    const config = { get: jest.fn() } as unknown as ConfigService;
    const queueDepthSet = jest.fn();
    const lastSuccessSet = jest.fn();
    const consecutiveSet = jest.fn();
    const consecutiveInc = jest.fn();
    const processedInc = jest.fn();
    const failedInc = jest.fn();
    const metrics = {
      accountingQueueDepth: { set: queueDepthSet },
      accountingWorkerLastSuccess: { set: lastSuccessSet },
      accountingWorkerConsecutiveFailures: {
        set: consecutiveSet,
        inc: consecutiveInc,
      },
      accountingEventsProcessedTotal: { inc: processedInc },
      accountingEventsFailedTotal: { inc: failedInc },
    } as unknown as MetricsRegistryService;
    const worker = new AccountingEventWorker(
      prisma,
      accounting,
      config,
      metrics,
    );

    await expect(worker.runOnce()).resolves.toBe(true);
    expect(withTenant).toHaveBeenCalledWith('org-1', expect.any(Function));
    expect(processEvent).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-1', roleKey: 'SYSTEM_WORKER' }),
      'event-1',
    );
    expect(processedInc).toHaveBeenCalled();
    expect(lastSuccessSet).toHaveBeenCalled();
    expect(consecutiveSet).toHaveBeenCalledWith(0);
    expect(queueDepth).toHaveBeenCalledTimes(1);
    expect(queueDepthSet).toHaveBeenCalledWith({ status: 'PENDING' }, 2);
  });

  it('marks a claimed event failed without leaking the worker lock', async () => {
    const claim = jest
      .fn()
      .mockResolvedValue({ id: 'event-1', organizationId: 'org-1' });
    const markEventFailed = jest.fn().mockResolvedValue(true);
    const withTenant = jest.fn(
      async (_organizationId: string, callback: () => Promise<unknown>) =>
        callback(),
    );
    const queueDepth = jest
      .fn()
      .mockResolvedValue([{ status: 'PENDING', count: 2 }]);
    const prisma = {
      claimAccountingEvent: claim,
      withTenantContext: withTenant,
      accountingQueueDepth: queueDepth,
    } as unknown as PrismaService;
    const accounting = {
      processEvent: jest.fn().mockRejectedValue(new Error('failed')),
      markEventFailed,
    } as unknown as AccountingService;
    const config = { get: jest.fn() } as unknown as ConfigService;
    const queueDepthSet2 = jest.fn();
    const lastSuccessSet2 = jest.fn();
    const consecutiveSet2 = jest.fn();
    const consecutiveInc2 = jest.fn();
    const processedInc2 = jest.fn();
    const failedInc2 = jest.fn();
    const metrics = {
      accountingQueueDepth: { set: queueDepthSet2 },
      accountingWorkerLastSuccess: { set: lastSuccessSet2 },
      accountingWorkerConsecutiveFailures: {
        set: consecutiveSet2,
        inc: consecutiveInc2,
      },
      accountingEventsProcessedTotal: { inc: processedInc2 },
      accountingEventsFailedTotal: { inc: failedInc2 },
    } as unknown as MetricsRegistryService;
    const worker = new AccountingEventWorker(
      prisma,
      accounting,
      config,
      metrics,
    );

    await expect(worker.runOnce()).resolves.toBe(false);
    expect(markEventFailed).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-1' }),
      'event-1',
      expect.any(Error),
    );
    expect(failedInc2).toHaveBeenCalled();
    expect(consecutiveInc2).toHaveBeenCalled();
    expect(lastSuccessSet2).not.toHaveBeenCalled();
    expect(consecutiveSet2).not.toHaveBeenCalledWith(0);
    expect(queueDepthSet2).toHaveBeenCalledWith({ status: 'PENDING' }, 2);
  });
});
