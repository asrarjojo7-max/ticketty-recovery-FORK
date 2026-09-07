import { BadRequestException, ConflictException } from '@nestjs/common';
import { AccountType } from '@prisma/client';
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

  it('rejects closing a period with draft entries', async () => {
    const tx = {
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
});
