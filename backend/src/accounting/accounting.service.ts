import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountingEventType, Prisma } from '@prisma/client';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import {
  beginIdempotentOperation,
  completeIdempotentOperation,
  idempotencyRequestHash,
  requireIdempotencyKey,
} from '../common/idempotency';
import { paginationArgs } from '../common/dto/pagination-query.dto';
import { requireOrgId } from '../common/org';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConfigureAccountingPolicyDto,
  CreateAccountDto,
  CreateFiscalPeriodDto,
  CreateJournalDto,
  CreateJournalEntryDto,
  PostAccountingEventDto,
  QueryJournalEntryDto,
  ReverseJournalEntryDto,
} from './dto';

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  createAccount(user: AuthUser, dto: CreateAccountDto) {
    return this.prisma.account.create({
      data: { ...dto, organizationId: requireOrgId(user) },
    });
  }

  listAccounts(user: AuthUser) {
    return this.prisma.account.findMany({
      where: { organizationId: requireOrgId(user), active: true },
      orderBy: { code: 'asc' },
    });
  }

  async createPeriod(user: AuthUser, dto: CreateFiscalPeriodDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (startsAt > endsAt)
      throw new BadRequestException('فترة مالية غير صالحة');
    return this.prisma.fiscalPeriod.create({
      data: { ...dto, startsAt, endsAt, organizationId: requireOrgId(user) },
    });
  }

  listPeriods(user: AuthUser) {
    return this.prisma.fiscalPeriod.findMany({
      where: { organizationId: requireOrgId(user) },
      orderBy: [{ fiscalYear: 'desc' }, { periodNumber: 'desc' }],
    });
  }

  createJournal(user: AuthUser, dto: CreateJournalDto) {
    return this.prisma.journal.create({
      data: { ...dto, organizationId: requireOrgId(user) },
    });
  }

  listJournals(user: AuthUser) {
    return this.prisma.journal.findMany({
      where: { organizationId: requireOrgId(user) },
      orderBy: { code: 'asc' },
    });
  }

  async configurePolicy(user: AuthUser, dto: ConfigureAccountingPolicyDto) {
    const organizationId = requireOrgId(user);
    if (dto.debitAccountId === dto.creditAccountId) {
      throw new BadRequestException('يجب اختلاف الحساب المدين عن الدائن');
    }
    return this.prisma.$transaction(async (tx) => {
      const [journal, accounts] = await Promise.all([
        tx.journal.findFirst({ where: { id: dto.journalId, organizationId } }),
        tx.account.findMany({
          where: {
            id: { in: [dto.debitAccountId, dto.creditAccountId] },
            organizationId,
            active: true,
          },
        }),
      ]);
      if (!journal) throw new NotFoundException('دفتر اليومية غير موجود');
      if (accounts.length !== 2) {
        throw new NotFoundException('أحد حسابات السياسة غير موجود أو غير نشط');
      }
      return tx.accountingPolicy.upsert({
        where: {
          organizationId_eventType: {
            organizationId,
            eventType: dto.eventType,
          },
        },
        create: { ...dto, organizationId },
        update: {
          journalId: dto.journalId,
          debitAccountId: dto.debitAccountId,
          creditAccountId: dto.creditAccountId,
          active: true,
        },
        include: { journal: true, debitAccount: true, creditAccount: true },
      });
    });
  }

  listPolicies(user: AuthUser) {
    return this.prisma.accountingPolicy.findMany({
      where: { organizationId: requireOrgId(user) },
      include: { journal: true, debitAccount: true, creditAccount: true },
      orderBy: { eventType: 'asc' },
    });
  }

  listEvents(user: AuthUser) {
    return this.prisma.accountingEvent.findMany({
      where: { organizationId: requireOrgId(user) },
      include: { journalEntry: true },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });
  }

  async postBusinessEvent(
    user: AuthUser,
    dto: PostAccountingEventDto,
    idempotencyKey?: string,
  ) {
    const organizationId = requireOrgId(user);
    const key = requireIdempotencyKey(idempotencyKey);
    const requestHash = idempotencyRequestHash(dto);
    return this.prisma.$transaction(async (tx) => {
      const operation = await beginIdempotentOperation(
        tx,
        organizationId,
        'accounting.events.post',
        key,
        requestHash,
      );
      if (operation.replay) {
        const replay = await tx.journalEntry.findFirst({
          where: { id: operation.record.resourceId ?? '', organizationId },
          include: { lines: true, journal: true, fiscalPeriod: true },
        });
        if (!replay) throw new ConflictException('تعذر استعادة القيد السابق');
        return replay;
      }

      const policy = await tx.accountingPolicy.findFirst({
        where: { organizationId, eventType: dto.eventType, active: true },
      });
      if (!policy) throw new ConflictException('سياسة المحاسبة غير مهيأة');
      const amount = await this.resolveEventAmount(
        tx,
        organizationId,
        dto.eventType,
        dto.sourceId,
      );
      const draft = await this.createEntry(user, {
        journalId: policy.journalId,
        fiscalPeriodId: dto.fiscalPeriodId,
        entryNumber: dto.entryNumber,
        entryDate: dto.entryDate,
        sourceType: dto.eventType,
        sourceId: dto.sourceId,
        currency: (
          await tx.organization.findUniqueOrThrow({
            where: { id: organizationId },
            select: { currency: true },
          })
        ).currency,
        description: dto.description,
        lines: [
          {
            accountId: policy.debitAccountId,
            debit: amount.toNumber(),
            credit: 0,
          },
          {
            accountId: policy.creditAccountId,
            debit: 0,
            credit: amount.toNumber(),
          },
        ],
      });
      const posted = await this.postEntry(user, draft.id);
      await completeIdempotentOperation(
        tx,
        operation.record.id,
        'JournalEntry',
        posted.id,
      );
      await tx.accountingEvent.updateMany({
        where: {
          organizationId,
          eventType: dto.eventType,
          sourceId: dto.sourceId,
        },
        data: {
          status: 'POSTED',
          journalEntryId: posted.id,
          processedAt: new Date(),
          lastError: null,
          lockedAt: null,
          lockedBy: null,
        },
      });
      return posted;
    });
  }

  async requeueEvent(user: AuthUser, id: string) {
    const organizationId = requireOrgId(user);
    const result = await this.prisma.accountingEvent.updateMany({
      where: { id, organizationId, status: 'FAILED' },
      data: {
        status: 'PENDING',
        attempts: 0,
        lastError: null,
        availableAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    });
    if (result.count === 0) {
      throw new ConflictException('الحدث غير موجود أو ليس في قائمة الفشل');
    }
    return this.prisma.accountingEvent.findUniqueOrThrow({ where: { id } });
  }

  async reconciliation(user: AuthUser) {
    const organizationId = requireOrgId(user);
    const [
      events,
      payments,
      refunds,
      expenses,
      settlements,
      accounts,
      balances,
    ] = await Promise.all([
      this.prisma.accountingEvent.groupBy({
        by: ['eventType', 'status'],
        where: { organizationId },
        _count: { _all: true },
      }),
      this.prisma.payment.count({ where: { organizationId } }),
      this.prisma.refund.count({
        where: { organizationId, status: 'COMPLETED' },
      }),
      this.prisma.expense.count({
        where: { organizationId, status: { not: 'DRAFT' } },
      }),
      this.prisma.settlement.count({
        where: { organizationId, status: 'SETTLED' },
      }),
      this.prisma.account.findMany({
        where: { organizationId, active: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.journalEntryLine.groupBy({
        by: ['accountId'],
        where: { organizationId, entry: { status: 'POSTED' } },
        _sum: { debit: true, credit: true },
      }),
    ]);
    const balanceByAccount = new Map(
      balances.map((balance) => [
        balance.accountId,
        {
          debit: balance._sum.debit ?? new Prisma.Decimal(0),
          credit: balance._sum.credit ?? new Prisma.Decimal(0),
        },
      ]),
    );
    return {
      subledgers: {
        payments,
        refunds,
        expenses,
        settlements,
      },
      events: events.map((event) => ({
        eventType: event.eventType,
        status: event.status,
        count: event._count._all,
      })),
      accounts: accounts.map((account) => {
        const totals = balanceByAccount.get(account.id) ?? {
          debit: new Prisma.Decimal(0),
          credit: new Prisma.Decimal(0),
        };
        return {
          id: account.id,
          code: account.code,
          name: account.name,
          type: account.type,
          debit: totals.debit,
          credit: totals.credit,
          balance: totals.debit.minus(totals.credit),
        };
      }),
    };
  }

  async processNextEvent(user: AuthUser) {
    const organizationId = requireOrgId(user);
    const workerId = `user:${user.sub}`;
    const claimed = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "accounting_events"
        WHERE "organizationId" = ${organizationId}
          AND "status" IN ('PENDING', 'FAILED')
          AND "attempts" < 5
          AND "availableAt" <= CURRENT_TIMESTAMP
          AND ("lockedAt" IS NULL OR "lockedAt" < CURRENT_TIMESTAMP - INTERVAL '5 minutes')
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;
      const id = rows[0]?.id;
      if (!id) return null;
      return tx.accountingEvent.update({
        where: { id },
        data: {
          status: 'PENDING',
          attempts: { increment: 1 },
          lockedAt: new Date(),
          lockedBy: workerId,
        },
      });
    });
    if (!claimed) return { processed: false as const };

    try {
      const result = await this.processEvent(user, claimed.id);
      return { processed: true as const, result };
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 500) : 'Unknown error';
      await this.prisma.accountingEvent.update({
        where: { id: claimed.id },
        data: {
          status: 'FAILED',
          lastError: message,
          lockedAt: null,
          lockedBy: null,
          availableAt: new Date(
            Date.now() + Math.min(claimed.attempts, 5) * 60_000,
          ),
        },
      });
      return { processed: false as const, eventId: claimed.id, error: message };
    }
  }

  async markEventFailed(user: AuthUser, id: string, error: unknown) {
    const organizationId = requireOrgId(user);
    const event = await this.prisma.accountingEvent.findFirst({
      where: { id, organizationId },
    });
    if (!event) return;
    const message =
      error instanceof Error ? error.message.slice(0, 500) : 'Unknown error';
    await this.prisma.accountingEvent.update({
      where: { id },
      data: {
        status: 'FAILED',
        lastError: message,
        lockedAt: null,
        lockedBy: null,
        availableAt: new Date(
          Date.now() + Math.min(event.attempts, 5) * 60_000,
        ),
      },
    });
  }

  async processEvent(user: AuthUser, id: string) {
    const organizationId = requireOrgId(user);
    const event = await this.prisma.accountingEvent.findFirst({
      where: { id, organizationId },
      include: { journalEntry: { include: { lines: true } } },
    });
    if (!event) throw new NotFoundException('الحدث المحاسبي غير موجود');
    if (event.status === 'POSTED' && event.journalEntry) {
      return { event, journalEntry: event.journalEntry };
    }
    const period = await this.prisma.fiscalPeriod.findFirst({
      where: {
        organizationId,
        status: 'OPEN',
        startsAt: { lte: event.createdAt },
        endsAt: { gte: event.createdAt },
      },
      orderBy: { startsAt: 'asc' },
    });
    if (!period) throw new ConflictException('لا توجد فترة مالية مفتوحة للحدث');
    const journalEntry = await this.postBusinessEvent(
      user,
      {
        eventType: event.eventType,
        sourceId: event.sourceId,
        fiscalPeriodId: period.id,
        entryNumber: `AUTO-${event.id}`,
        entryDate: event.createdAt.toISOString().slice(0, 10),
        description: `Automatic posting for ${event.eventType}`,
      },
      `accounting-event-${event.id}`,
    );
    return { eventId: event.id, journalEntry };
  }

  async createEntry(user: AuthUser, dto: CreateJournalEntryDto) {
    const organizationId = requireOrgId(user);
    const debits = dto.lines.reduce(
      (total, line) => total.plus(line.debit),
      new Prisma.Decimal(0),
    );
    const credits = dto.lines.reduce(
      (total, line) => total.plus(line.credit),
      new Prisma.Decimal(0),
    );
    if (debits.lte(0) || !debits.equals(credits)) {
      throw new BadRequestException('يجب أن يكون القيد متوازناً');
    }
    if (dto.lines.some((line) => line.debit > 0 === line.credit > 0)) {
      throw new BadRequestException('كل سطر يجب أن يكون مديناً أو دائناً فقط');
    }

    return this.prisma.$transaction(async (tx) => {
      const [journal, period, accounts] = await Promise.all([
        tx.journal.findFirst({ where: { id: dto.journalId, organizationId } }),
        tx.fiscalPeriod.findFirst({
          where: { id: dto.fiscalPeriodId, organizationId },
        }),
        tx.account.findMany({
          where: {
            id: { in: [...new Set(dto.lines.map((line) => line.accountId))] },
            organizationId,
            active: true,
          },
          select: { id: true },
        }),
      ]);
      if (!journal) throw new NotFoundException('دفتر اليومية غير موجود');
      if (!period) throw new NotFoundException('الفترة المالية غير موجودة');
      if (period.status !== 'OPEN') {
        throw new ConflictException('الفترة المالية مغلقة');
      }
      const entryDate = new Date(dto.entryDate);
      if (entryDate < period.startsAt || entryDate > period.endsAt) {
        throw new BadRequestException('تاريخ القيد خارج الفترة المالية');
      }
      if (
        accounts.length !==
        new Set(dto.lines.map((line) => line.accountId)).size
      ) {
        throw new NotFoundException('أحد الحسابات غير موجود أو غير نشط');
      }

      return tx.journalEntry.create({
        data: {
          organizationId,
          journalId: dto.journalId,
          fiscalPeriodId: dto.fiscalPeriodId,
          entryNumber: dto.entryNumber,
          entryDate,
          sourceType: dto.sourceType,
          sourceId: dto.sourceId,
          currency: dto.currency,
          description: dto.description,
          lines: {
            create: dto.lines.map((line, index) => ({
              lineNumber: index + 1,
              accountId: line.accountId,
              debit: new Prisma.Decimal(line.debit),
              credit: new Prisma.Decimal(line.credit),
              currency: dto.currency,
              description: line.description,
            })),
          },
        },
        include: { lines: true, journal: true, fiscalPeriod: true },
      });
    });
  }

  listEntries(user: AuthUser, query: QueryJournalEntryDto) {
    return this.prisma.journalEntry.findMany({
      where: {
        organizationId: requireOrgId(user),
        ...(query.status ? { status: query.status } : {}),
      },
      ...paginationArgs(query),
      include: { lines: true, journal: true, fiscalPeriod: true },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async postEntry(user: AuthUser, id: string) {
    const organizationId = requireOrgId(user);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:journal-entry:${id}`}))`;
      const entry = await tx.journalEntry.findFirst({
        where: { id, organizationId },
      });
      if (!entry) throw new NotFoundException('القيد غير موجود');
      if (entry.status !== 'DRAFT') {
        throw new ConflictException('لا يمكن ترحيل قيد غير مسودة');
      }
      return tx.journalEntry.update({
        where: { id },
        data: { status: 'POSTED', postedById: user.sub, postedAt: new Date() },
        include: { lines: true, journal: true, fiscalPeriod: true },
      });
    });
  }

  async reverseEntry(
    user: AuthUser,
    id: string,
    dto: ReverseJournalEntryDto,
    idempotencyKey?: string,
  ) {
    const organizationId = requireOrgId(user);
    const key = requireIdempotencyKey(idempotencyKey);
    const requestHash = idempotencyRequestHash({ entryId: id, ...dto });

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:journal-reversal:${id}`}))`;
      const operation = await beginIdempotentOperation(
        tx,
        organizationId,
        'accounting.entries.reverse',
        key,
        requestHash,
      );
      if (operation.replay) {
        const replay = await tx.journalEntry.findFirst({
          where: { id: operation.record.resourceId ?? '', organizationId },
          include: { lines: true, journal: true, fiscalPeriod: true },
        });
        if (!replay) throw new ConflictException('تعذر استعادة نتيجة العكس');
        return replay;
      }

      const original = await tx.journalEntry.findFirst({
        where: { id, organizationId },
        include: { lines: true },
      });
      if (!original) throw new NotFoundException('القيد غير موجود');
      if (original.status !== 'POSTED') {
        throw new ConflictException('يمكن عكس قيد مرحل فقط');
      }
      const existingReversal = await tx.journalEntry.findFirst({
        where: { organizationId, reversalOfId: id },
      });
      if (existingReversal) {
        throw new ConflictException('تم عكس القيد مسبقاً');
      }
      const period = await tx.fiscalPeriod.findFirst({
        where: { id: dto.fiscalPeriodId, organizationId },
      });
      if (!period || period.status !== 'OPEN') {
        throw new ConflictException('فترة العكس غير متاحة');
      }
      const entryDate = new Date(dto.entryDate);
      if (entryDate < period.startsAt || entryDate > period.endsAt) {
        throw new BadRequestException('تاريخ العكس خارج الفترة المالية');
      }

      const reversal = await tx.journalEntry.create({
        data: {
          organizationId,
          journalId: original.journalId,
          fiscalPeriodId: dto.fiscalPeriodId,
          entryNumber: dto.entryNumber,
          entryDate,
          sourceType: 'REVERSAL',
          sourceId: original.id,
          currency: original.currency,
          description: dto.reason,
          reversalOfId: original.id,
          lines: {
            create: original.lines.map((line) => ({
              lineNumber: line.lineNumber,
              accountId: line.accountId,
              debit: line.credit,
              credit: line.debit,
              currency: line.currency,
              description: dto.reason,
            })),
          },
        },
      });
      const posted = await tx.journalEntry.update({
        where: { id: reversal.id },
        data: { status: 'POSTED', postedById: user.sub, postedAt: new Date() },
        include: { lines: true, journal: true, fiscalPeriod: true },
      });
      await tx.journalEntry.update({
        where: { id: original.id },
        data: { status: 'REVERSED' },
      });
      await completeIdempotentOperation(
        tx,
        operation.record.id,
        'JournalEntry',
        posted.id,
      );
      return posted;
    });
  }

  private async resolveEventAmount(
    tx: Prisma.TransactionClient,
    organizationId: string,
    eventType: AccountingEventType,
    sourceId: string,
  ): Promise<Prisma.Decimal> {
    if (eventType === AccountingEventType.PAYMENT_RECEIVED) {
      const payment = await tx.payment.findFirst({
        where: { id: sourceId, organizationId },
      });
      if (!payment) throw new NotFoundException('الدفعة غير موجودة');
      return payment.amount;
    }
    if (eventType === AccountingEventType.REFUND_COMPLETED) {
      const refund = await tx.refund.findFirst({
        where: { id: sourceId, organizationId, status: 'COMPLETED' },
      });
      if (!refund) throw new NotFoundException('الاسترداد غير موجود');
      return refund.amount;
    }
    if (eventType === AccountingEventType.EXPENSE_APPROVED) {
      const expense = await tx.expense.findFirst({
        where: { id: sourceId, organizationId, status: { not: 'DRAFT' } },
        include: { adjustments: true },
      });
      if (!expense) throw new NotFoundException('المصروف المعتمد غير موجود');
      return expense.adjustments.reduce(
        (total, adjustment) =>
          adjustment.type === 'INCREASE'
            ? total.plus(adjustment.amount)
            : total.minus(adjustment.amount),
        expense.amount,
      );
    }
    const settlement = await tx.settlement.findFirst({
      where: { id: sourceId, organizationId, status: 'SETTLED' },
    });
    if (!settlement) throw new NotFoundException('التسوية النهائية غير موجودة');
    return settlement.netAmount;
  }

  async closePeriod(user: AuthUser, id: string) {
    const organizationId = requireOrgId(user);
    return this.prisma.$transaction(async (tx) => {
      const period = await tx.fiscalPeriod.findFirst({
        where: { id, organizationId },
      });
      if (!period) throw new NotFoundException('الفترة المالية غير موجودة');
      if (period.status !== 'OPEN') {
        throw new ConflictException('الفترة المالية مغلقة مسبقاً');
      }
      const drafts = await tx.journalEntry.count({
        where: { fiscalPeriodId: id, organizationId, status: 'DRAFT' },
      });
      if (drafts > 0) {
        throw new ConflictException(
          'لا يمكن إغلاق فترة تحتوي قيوداً غير مرحلة',
        );
      }
      return tx.fiscalPeriod.update({
        where: { id },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
    });
  }
}
