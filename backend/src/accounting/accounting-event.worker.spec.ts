import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingEventWorker } from './accounting-event.worker';
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
    const prisma = {
      claimAccountingEvent: claim,
      withTenantContext: withTenant,
    } as unknown as PrismaService;
    const accounting = { processEvent } as unknown as AccountingService;
    const config = { get: jest.fn() } as unknown as ConfigService;
    const worker = new AccountingEventWorker(prisma, accounting, config);

    await expect(worker.runOnce()).resolves.toBe(true);
    expect(withTenant).toHaveBeenCalledWith('org-1', expect.any(Function));
    expect(processEvent).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-1', roleKey: 'SYSTEM_WORKER' }),
      'event-1',
    );
  });

  it('marks a claimed event failed without leaking the worker lock', async () => {
    const claim = jest
      .fn()
      .mockResolvedValue({ id: 'event-1', organizationId: 'org-1' });
    const markEventFailed = jest.fn().mockResolvedValue(undefined);
    const withTenant = jest.fn(
      async (_organizationId: string, callback: () => Promise<unknown>) =>
        callback(),
    );
    const prisma = {
      claimAccountingEvent: claim,
      withTenantContext: withTenant,
    } as unknown as PrismaService;
    const accounting = {
      processEvent: jest.fn().mockRejectedValue(new Error('failed')),
      markEventFailed,
    } as unknown as AccountingService;
    const config = { get: jest.fn() } as unknown as ConfigService;
    const worker = new AccountingEventWorker(prisma, accounting, config);

    await expect(worker.runOnce()).resolves.toBe(true);
    expect(markEventFailed).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-1' }),
      'event-1',
      expect.any(Error),
    );
  });
});
