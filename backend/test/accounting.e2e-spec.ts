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
    // تنظيف ذرّي واحد: DISABLE + DELETEs + كل شيء داخل معاملة واحدة.
    // ALTER TABLE قابل للتراجع في PostgreSQL — لو انهارت المعاملة في
    // أي نقطة (timeout، اتصال مقطوع) تُرجع الحارسات لوضعها المسلّح
    // تلقائياً. (حدث فعلاً في تشغيل مُثقل سابق: timeout وسط التنظيف
    // المنفصل ترك posting_guard معطلاً وأفسد كل التشغيلات بعده.)
    try {
      await owner.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(
            'ALTER TABLE "journal_entry_lines" DISABLE TRIGGER "journal_entry_lines_immutability_guard"',
          );
          await tx.$executeRawUnsafe(
            'ALTER TABLE "journal_entries" DISABLE TRIGGER "journal_entries_posting_guard"',
          );
          await tx.accountingEvent.deleteMany({ where: { organizationId } });
          await tx.journalEntryLine.deleteMany({ where: { organizationId } });
          await tx.journalEntry.deleteMany({ where: { organizationId } });
          await tx.accountingPolicy.deleteMany({ where: { organizationId } });
          await tx.expense.deleteMany({ where: { organizationId } });
          await tx.journal.deleteMany({ where: { organizationId } });
          await tx.fiscalPeriod.deleteMany({ where: { organizationId } });
          await tx.account.deleteMany({ where: { organizationId } });
          await tx.idempotencyRecord.deleteMany({ where: { organizationId } });
          await tx.organization.delete({ where: { id: organizationId } });
          // ENABLE داخل المعاملة — نفس الضمانة: الانهيار يُرجع
          // الـ DISABLE والـ ENABLE معاً (الحارس مسلح دائماً).
          await tx.$executeRawUnsafe(
            'ALTER TABLE "journal_entries" ENABLE TRIGGER "journal_entries_posting_guard"',
          );
          await tx.$executeRawUnsafe(
            'ALTER TABLE "journal_entry_lines" ENABLE TRIGGER "journal_entry_lines_immutability_guard"',
          );
        },
        { timeout: 60_000 },
      );
    } catch {
      // انهارت المعاملة → رُجعت كاملة بضمانة الذرّية (الحارسات
      // سليمة). المنظمة الاختبارية تبقى — بقايا dev مقبولة.
    } finally {
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
    // إنشاء المصروف + الحدث يجب أن يلتزم ثم يبدأ worker/manual processing
    // في معاملة مستقلة؛ هذا يحاكي outbox lifecycle الحقيقي ويمنع الاختبار
    // من معاملة واحدة تخفي مشاكل رؤية/claim الطابور.
    const setup = await runtime.withTenantContext(organizationId, async () => {
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
      return {
        expenseAccountId: expenseAccount.id,
        cashId: cash.id,
        eventId: event.id,
      };
    });

    const processed = await runtime.withTenantContext(organizationId, () =>
      accounting.processNextEvent(user),
    );
    if (!processed.processed) {
      throw new Error(
        `Expected queued event processing: ${processed.error ?? 'no event was claimed'}`,
      );
    }

    const replay = await runtime.withTenantContext(organizationId, () =>
      accounting.processEvent(user, setup.eventId),
    );
    const result = {
      first: processed.result.journalEntry,
      replay: replay.journalEntry,
      expenseAccountId: setup.expenseAccountId,
      cashId: setup.cashId,
      eventId: setup.eventId,
    };

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
