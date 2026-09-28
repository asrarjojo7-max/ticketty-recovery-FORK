import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { SettlementsService } from './settlements.service';

const user: AuthUser = {
  sub: 'user-1',
  orgId: 'org-1',
  branchId: null,
  name: 'Test',
  email: 'test@example.com',
  roleKey: 'FINANCE',
  permissions: ['*'],
};

describe('SettlementsService integrity', () => {
  const executeRaw = jest.fn().mockResolvedValue([]);
  const findAgent = jest.fn();
  const findSettlement = jest.fn();
  const commissionQueries: Prisma.CommissionFindManyArgs[] = [];
  const commissionResults: Array<{
    id: string;
    amount: Prisma.Decimal;
    ticket: { fare: Prisma.Decimal };
  }> = [];
  const findCommissions = jest.fn((args: Prisma.CommissionFindManyArgs) => {
    commissionQueries.push(args);
    return Promise.resolve(commissionResults);
  });
  const createSettlement = jest.fn();
  const updateSettlement = jest.fn();
  const createLines = jest.fn();
  const tx = {
    $executeRaw: executeRaw,
    agent: { findFirst: findAgent },
    commission: { findMany: findCommissions },
    settlement: {
      findFirst: findSettlement,
      create: createSettlement,
      update: updateSettlement,
    },
    settlementLine: {
      deleteMany: jest.fn(),
      createMany: createLines,
    },
    accountingEvent: { upsert: jest.fn().mockResolvedValue({ id: 'event-1' }) },
  };
  const transaction = jest.fn((callback: (client: typeof tx) => unknown) =>
    Promise.resolve(callback(tx)),
  );
  const prisma = { $transaction: transaction } as unknown as PrismaService;
  const audit = { log: jest.fn() } as unknown as AuditService;
  const service = new SettlementsService(prisma, audit);

  beforeEach(() => {
    jest.clearAllMocks();
    commissionQueries.length = 0;
    commissionResults.length = 0;
  });

  it('rejects an inverted settlement period', async () => {
    await expect(
      service.generate(user, {
        agentId: 'agent-1',
        from: '2026-08-10',
        to: '2026-08-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('excludes reversed commissions from generation', async () => {
    findAgent.mockResolvedValue({ id: 'agent-1' });
    findSettlement.mockResolvedValue(null);
    commissionResults.push({
      id: 'commission-1',
      amount: new Prisma.Decimal(10),
      ticket: { fare: new Prisma.Decimal(100) },
    });
    createSettlement.mockResolvedValue({
      id: 'settlement-1',
      netAmount: new Prisma.Decimal(90),
    });

    await service.generate(user, {
      agentId: 'agent-1',
      from: '2026-08-01',
      to: '2026-08-10',
    });

    expect(commissionQueries[0]?.where?.reversedAt).toBeNull();
    expect(createLines).toHaveBeenCalledWith({
      data: [
        {
          organizationId: 'org-1',
          settlementId: 'settlement-1',
          commissionId: 'commission-1',
          amount: new Prisma.Decimal(10),
        },
      ],
    });
  });

  it('rejects regenerating a settled period', async () => {
    findAgent.mockResolvedValue({ id: 'agent-1' });
    findSettlement.mockResolvedValue({
      id: 'settlement-1',
      status: 'SETTLED',
      fromDate: new Date('2026-08-01T00:00:00.000Z'),
      toDate: new Date('2026-08-10T23:59:59.999Z'),
    });

    await expect(
      service.generate(user, {
        agentId: 'agent-1',
        from: '2026-08-01',
        to: '2026-08-10',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(updateSettlement).not.toHaveBeenCalled();
  });

  it('rebuilds an open settlement with existing and newly earned commissions', async () => {
    findAgent.mockResolvedValue({ id: 'agent-1' });
    findSettlement.mockResolvedValue({
      id: 'settlement-1',
      status: 'OPEN',
      fromDate: new Date('2026-08-01T00:00:00.000Z'),
      toDate: new Date('2026-08-10T23:59:59.999Z'),
    });
    updateSettlement.mockResolvedValue({
      id: 'settlement-1',
      netAmount: new Prisma.Decimal(180),
    });
    commissionResults.push(
      {
        id: 'commission-existing',
        amount: new Prisma.Decimal(20),
        ticket: { fare: new Prisma.Decimal(100) },
      },
      {
        id: 'commission-new',
        amount: new Prisma.Decimal(10),
        ticket: { fare: new Prisma.Decimal(90) },
      },
    );

    await service.generate(user, {
      agentId: 'agent-1',
      from: '2026-08-01',
      to: '2026-08-10',
    });

    expect(commissionQueries[0]?.where?.settlementLine).toBeUndefined();
    expect(commissionQueries[0]?.where?.OR).toEqual([
      { settlementLine: { is: null } },
      { settlementLine: { is: { settlementId: 'settlement-1' } } },
    ]);
    expect(updateSettlement).toHaveBeenCalled();
  });
  it('serializes settlement finalization with generation for the same agent', async () => {
    findSettlement
      .mockResolvedValueOnce({ agentId: 'agent-1' })
      .mockResolvedValueOnce({
        id: 'settlement-1',
        agentId: 'agent-1',
        status: 'OPEN',
      });
    updateSettlement.mockResolvedValue({
      id: 'settlement-1',
      status: 'SETTLED',
      netAmount: new Prisma.Decimal(90),
      agent: { id: 'agent-1' },
    });

    await service.settle(user, 'settlement-1');

    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(updateSettlement).toHaveBeenCalled();
    const [args] = updateSettlement.mock.calls[0] as [
      { where: { id: string }; data: { status: string } },
    ];
    expect(args.where).toEqual({ id: 'settlement-1' });
    expect(args.data.status).toBe('SETTLED');
  });

  it('does not finalize a settlement that disappears before locking', async () => {
    findSettlement.mockResolvedValueOnce(null);

    await expect(service.settle(user, 'settlement-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(updateSettlement).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
  });

});