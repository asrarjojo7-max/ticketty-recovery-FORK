import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { AccountType, AccountingEventType, PrismaClient } from '@prisma/client';
import { AccountingService } from '../src/accounting/accounting.service';
import { AuditService } from '../src/common/audit/audit.service';
import type { AuthUser } from '../src/common/decorators/current-user.decorator';
import { ExpensesService } from '../src/expenses/expenses.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('accounting lifecycle under tenant RLS', () => {
  const owner = new PrismaClient();
  const runtime = new PrismaService();
  const accounting = new AccountingService(runtime);
  const audit = {
    log: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;
  const expenses = new ExpensesService(runtime, audit);
  const suffix = randomUUID();
  const organizationId = `accounting-org-${suffix}`;
  const user: AuthUser = {
    sub: 'finance-user',
    orgId: organizationId,
    branchId: null,
    name: 'Finance',
    email: 'finance@example.invalid',
    roleKey: 'FINANCE',
    permissions: ['accounting.write', 'accounting.post', 'accounting.close'],
  };

  beforeAll(async () => {
    await owner.organization.create({
      data: {
        id: organizationId,
        name: 'Accounting E2E',
        slug: organizationId,
      },
    });
  });

  afterAll(async () => {
    try {
      await owner.$executeRawUnsafe(
        'ALTER TABLE "journal_entry_lines" DISABLE TRIGGER "journal_entry_lines_immutability_guard"',
      );
      await owner.$executeRawUnsafe(
        'ALTER TABLE "journal_entries" DISABLE TRIGGER "journal_entries_posting_guard"',
      );
      await owner.accountingEvent.deleteMany({ where: { organizationId } });
      await owner.journalEntryLine.deleteMany({ where: { organizationId } });
      await owner.journalEntry.deleteMany({ where: { organizationId } });
      await owner.accountingPolicy.deleteMany({ where: { organizationId } });
      await owner.expense.deleteMany({ where: { organizationId } });
      await owner.journal.deleteMany({ where: { organizationId } });
      await owner.fiscalPeriod.deleteMany({ where: { organizationId } });
      await owner.account.deleteMany({ where: { organizationId } });
      await owner.idempotencyRecord.deleteMany({ where: { organizationId } });
      await owner.organization.delete({ where: { id: organizationId } });
    } finally {
      await owner.$executeRawUnsafe(
        'ALTER TABLE "journal_entries" ENABLE TRIGGER "journal_entries_posting_guard"',
      );
      await owner.$executeRawUnsafe(
        'ALTER TABLE "journal_entry_lines" ENABLE TRIGGER "journal_entry_lines_immutability_guard"',
      );
      await Promise.all([owner.$disconnect(), runtime.$disconnect()]);
    }
  });

  it('creates, posts, and reverses a balanced entry', async () => {
    const result = await runtime.withTenantContext(organizationId, async () => {
      const cash = await accounting.createAccount(user, {
        code: '1000',
        name: 'Cash',
        type: AccountType.ASSET,
      });
      const revenue = await accounting.createAccount(user, {
        code: '4000',
        name: 'Revenue',
        type: AccountType.REVENUE,
      });
      const period = await accounting.createPeriod(user, {
        fiscalYear: 2026,
        periodNumber: 1,
        startsAt: '2026-01-01',
        endsAt: '2026-12-31',
      });
      const journal = await accounting.createJournal(user, {
        code: 'SALES',
        name: 'Sales',
      });
      const draft = await accounting.createEntry(user, {
        journalId: journal.id,
        fiscalPeriodId: period.id,
        entryNumber: 'JE-1',
        entryDate: '2026-09-01',
        sourceType: 'TEST_SALE',
        sourceId: 'sale-1',
        currency: 'SDG',
        description: 'Test sale',
        lines: [
          { accountId: cash.id, debit: 100, credit: 0 },
          { accountId: revenue.id, debit: 0, credit: 100 },
        ],
      });
      const posted = await accounting.postEntry(user, draft.id);
      const reversal = await accounting.reverseEntry(
        user,
        posted.id,
        {
          fiscalPeriodId: period.id,
          entryNumber: 'JE-2',
          entryDate: '2026-09-02',
          reason: 'Correction',
        },
        'accounting-reversal-key',
      );
      return { originalId: posted.id, reversal };
    });

    const original = await owner.journalEntry.findUniqueOrThrow({
      where: { id: result.originalId },
      include: { lines: true },
    });
    expect(original.status).toBe('REVERSED');
    expect(result.reversal.status).toBe('POSTED');
    expect(result.reversal.reversalOfId).toBe(original.id);
    expect(
      result.reversal.lines.map((line) => [
        line.debit.toNumber(),
        line.credit.toNumber(),
      ]),
    ).toEqual([
      [0, 100],
      [100, 0],
    ]);
  });

  it('posts an approved expense through a configured accounting policy once', async () => {
    const result = await runtime.withTenantContext(organizationId, async () => {
      const [cash, expenseAccount, journal] = await Promise.all([
        runtime.account.findFirstOrThrow({
          where: { organizationId, code: '1000' },
        }),
        accounting.createAccount(user, {
          code: '5000',
          name: 'Operating Expense',
          type: AccountType.EXPENSE,
        }),
        runtime.journal.findFirstOrThrow({
          where: { organizationId, code: 'SALES' },
        }),
      ]);
      await accounting.configurePolicy(user, {
        eventType: AccountingEventType.EXPENSE_APPROVED,
        journalId: journal.id,
        debitAccountId: expenseAccount.id,
        creditAccountId: cash.id,
      });
      const expense = await expenses.create(user, {
        description: 'Fuel',
        amount: 25,
      });
      await expenses.approve(user, expense.id);
      const event = await runtime.accountingEvent.findUniqueOrThrow({
        where: {
          organizationId_eventType_sourceId: {
            organizationId,
            eventType: AccountingEventType.EXPENSE_APPROVED,
            sourceId: expense.id,
          },
        },
      });
      const processed = await accounting.processNextEvent(user);
      if (!processed.processed)
        throw new Error('Expected queued event processing');
      const replay = await accounting.processEvent(user, event.id);
      return {
        first: processed.result.journalEntry,
        replay: replay.journalEntry,
        expenseAccountId: expenseAccount.id,
        cashId: cash.id,
        eventId: event.id,
      };
    });

    expect(result.first.id).toBe(result.replay.id);
    expect(result.first.status).toBe('POSTED');
    expect(result.first.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountId: result.expenseAccountId }),
        expect.objectContaining({ accountId: result.cashId }),
      ]),
    );
    await expect(
      owner.journalEntry.count({
        where: { organizationId, sourceType: 'EXPENSE_APPROVED' },
      }),
    ).resolves.toBe(1);
    await expect(
      owner.accountingEvent.findUniqueOrThrow({
        where: { id: result.eventId },
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'POSTED',
        journalEntryId: result.first.id,
      }),
    );
    const reconciliation = await runtime.withTenantContext(organizationId, () =>
      accounting.reconciliation(user),
    );
    expect(reconciliation.subledgers.expenses).toBe(1);
    expect(reconciliation.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'EXPENSE_APPROVED',
          status: 'POSTED',
          count: 1,
        }),
      ]),
    );
  });
});
