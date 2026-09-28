import { BadRequestException, ConflictException } from '@nestjs/common';
import { AccountType, AccountingEventType, Prisma } from '@prisma/client';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from './accounting.service';

const user: AuthUser = {
  sub: 'finance-1',
  orgId: 'org-1',
  branchId: null,
  name: 'Finance',
  email: 'finance@example.com',
  roleKey: 'FINANCE',
  permissions: ['accounting.write', 'accounting.post'],
};

describe('AccountingService', () => {
  it('rejects an unbalanced draft before touching the database', async () => {
    const transaction = jest.fn();
    const service = new AccountingService({
      $transaction: transaction,
    } as unknown as PrismaService);

    await expect(
      service.createEntry(user, {
        journalId: 'journal-1',
        fiscalPeriodId: 'period-1',
        entryNumber: 'JE-1',
        entryDate: '2026-09-01',
        sourceType: 'TEST',
        sourceId: 'source-1',
        currency: 'SDG',
        description: 'Unbalanced',
        lines: [
          { accountId: 'cash', debit: 100, credit: 0 },
          { accountId: 'revenue', debit: 0, credit: 90 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('posts a business event through one database transaction', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      accountingPolicy: {
        findFirst: jest.fn().mockResolvedValue({
          journalId: 'journal-1',
          debitAccountId: 'cash',
          creditAccountId: 'revenue',
        }),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue({
          amount: new Prisma.Decimal(100),
        }),
      },
      organization: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ currency: 'SDG' }),
      },
      journal: {
        findFirst: jest.fn().mockResolvedValue({ id: 'journal-1' }),
      },
      fiscalPeriod: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'period-1',
          status: 'OPEN',
          startsAt: new Date('2026-09-01T00:00:00.000Z'),
          endsAt: new Date('2026-09-30T00:00:00.000Z'),
        }),
      },
      account: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'cash' }, { id: 'revenue' }]),
      },
      journalEntry: {
        create: jest.fn().mockResolvedValue({
          id: 'entry-1',
          status: 'DRAFT',
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'entry-1',
          status: 'DRAFT',
          fiscalPeriodId: 'period-1',
          entryDate: new Date('2026-09-01T00:00:00.000Z'),
        }),
        update: jest.fn().mockResolvedValue({
          id: 'entry-1',
          status: 'POSTED',
        }),
      },
      accountingEvent: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      idempotencyRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'operation-1',
          status: 'PROCESSING',
          requestHash: 'hash',
          expiresAt: new Date(Date.now() + 60_000),
        }),
        update: jest.fn().mockResolvedValue({
          id: 'operation-1',
          status: 'COMPLETED',
        }),
      },
    };
    const transaction = jest.fn(
      (callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
    );
    const service = new AccountingService({
      $transaction: transaction,
    } as unknown as PrismaService);

    const result = await service.postBusinessEvent(
      user,
      {
        eventType: AccountingEventType.PAYMENT_RECEIVED,
        sourceId: 'payment-1',
        fiscalPeriodId: 'period-1',
        entryNumber: 'AUTO-1',
        entryDate: '2026-09-01',
        description: 'Payment',
      },
      'request-key-123',
    );

    expect(result).toMatchObject({ id: 'entry-1', status: 'POSTED' });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.journalEntry.create).toHaveBeenCalledTimes(1);
    expect(tx.journalEntry.update).toHaveBeenCalledTimes(1);
  });

  it('rejects closing a period with draft entries', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      fiscalPeriod: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'period-1', status: 'OPEN' }),
        update: jest.fn(),
      },
      journalEntry: { count: jest.fn().mockResolvedValue(1) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
    } as unknown as PrismaService;
    const service = new AccountingService(prisma);

    await expect(service.closePeriod(user, 'period-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.fiscalPeriod.update).not.toHaveBeenCalled();
  });

  it('requeues only failed events inside the tenant', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findUniqueOrThrow = jest.fn().mockResolvedValue({
      id: 'event-1',
      status: 'PENDING',
    });
    const service = new AccountingService({
      accountingEvent: { updateMany, findUniqueOrThrow },
    } as unknown as PrismaService);

    await expect(service.requeueEvent(user, 'event-1')).resolves.toEqual({
      id: 'event-1',
      status: 'PENDING',
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event-1', organizationId: 'org-1', status: 'FAILED' },
      }),
    );
  });

  it('creates tenant-scoped accounts', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'account-1' });
    const service = new AccountingService({
      account: { create },
    } as unknown as PrismaService);

    await service.createAccount(user, {
      code: '1000',
      name: 'Cash',
      type: AccountType.ASSET,
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        code: '1000',
        name: 'Cash',
        type: AccountType.ASSET,
        organizationId: 'org-1',
      },
    });
  });

  it('marks a failed event only while the caller still owns its lease', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findFirst = jest.fn().mockResolvedValue({ attempts: 2 });
    const service = new AccountingService({
      accountingEvent: { findFirst, updateMany },
    } as unknown as PrismaService);

    const marked = await service.markEventFailed(
      user,
      'event-1',
      new Error('worker failed'),
    );

    expect(marked).toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 'event-1',
        organizationId: 'org-1',
        status: 'PENDING',
        lockedBy: 'finance-1',
      },
      select: { attempts: true },
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'event-1',
          organizationId: 'org-1',
          status: 'PENDING',
          lockedBy: 'finance-1',
        },
      }),
    );
  });

  it('does not overwrite an event whose lease moved to another worker', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const updateMany = jest.fn();
    const service = new AccountingService({
      accountingEvent: { findFirst, updateMany },
    } as unknown as PrismaService);

    await expect(
      service.markEventFailed(user, 'event-1', new Error('stale worker')),
    ).resolves.toBe(false);

    expect(updateMany).not.toHaveBeenCalled();
  });
});
